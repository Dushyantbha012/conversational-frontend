export interface GroupDiscussionConfig {
  action: "create" | "join";
  user_name: string;
  topic?: string;  // Required for "create", optional for "join"
  code?: string;   // Required for "join", not needed for "create"
}

export interface DiscussionMessage {
  name: string;
  content: string;
  timestamp?: number;
}

export interface DiscussionResponse {
  status?: string;
  message?: string;
  code?: string;
  topic?: string;
  user_name?: string;
  active_users?: number;
  history?: DiscussionMessage[];
  content?: string;
  name?: string; // Added for bot messages
}

export type MessageListener = (name: string, content: string) => void;
export type StatusChangeListener = (status: string, details?: any) => void;
export type ErrorListener = (error: string) => void;
export type ParticipantListener = (userName: string, isJoining: boolean, activeCount: number) => void;
export type AnalysisListener = (analysis: string, history?: DiscussionMessage[]) => void;

export class GroupDiscussionWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConfigured = false;
  private isAudioPaused = false;
  private onMessageListeners: MessageListener[] = [];
  private onStatusChangeListeners: StatusChangeListener[] = [];
  private onErrorListeners: ErrorListener[] = [];
  private onParticipantListeners: ParticipantListener[] = [];
  private onAnalysisListeners: AnalysisListener[] = [];
  private discussionCode: string | null = null;
  private discussionTopic: string | null = null;
  private userName: string | null = null;

  constructor(private serverUrl: string = "ws://localhost:8765") {}

  public addMessageListener(listener: MessageListener): void {
    this.onMessageListeners.push(listener);
  }

  public addStatusChangeListener(listener: StatusChangeListener): void {
    this.onStatusChangeListeners.push(listener);
  }

  public addErrorListener(listener: ErrorListener): void {
    this.onErrorListeners.push(listener);
  }

  public addParticipantListener(listener: ParticipantListener): void {
    this.onParticipantListeners.push(listener);
  }

  public addAnalysisListener(listener: AnalysisListener): void {
    this.onAnalysisListeners.push(listener);
  }

  public configure(config: GroupDiscussionConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        this.userName = config.user_name;
        
        this.ws.onopen = () => {
          console.log("WebSocket connected, sending configuration");
          if (this.ws) {
            this.ws.send(JSON.stringify(config));
          }
        };
        
        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.notifyError("Connection error occurred");
          reject(error);
        };
        
        this.ws.onmessage = (event) => {
          if (typeof event.data === "string") {
            try {
              const jsonData = JSON.parse(event.data) as DiscussionResponse;
              console.log("Received message:", jsonData);
              
              // Handle different status types
              switch(jsonData.status) {
                case "created":
                case "joined":
                  this.isConfigured = true;
                  this.discussionCode = jsonData.code || null;
                  this.discussionTopic = jsonData.topic || null;
                  this.notifyStatusChange(jsonData.status, {
                    code: jsonData.code,
                    topic: jsonData.topic
                  });
                  resolve();
                  break;
                  
                case "error":
                  this.notifyError(jsonData.message || "Unknown error");
                  reject(new Error(jsonData.message));
                  break;
                  
                case "user_joined":
                  this.notifyParticipantChange(
                    jsonData.user_name || "Unknown user",
                    true,
                    jsonData.active_users || 0
                  );
                  break;
                  
                case "user_left":
                  this.notifyParticipantChange(
                    jsonData.user_name || "Unknown user",
                    false,
                    jsonData.active_users || 0
                  );
                  break;
                  
                case "transcription":
                  // Handle real-time transcription messages
                  if (jsonData.user_name && jsonData.content) {
                    this.notifyMessage(jsonData.user_name, jsonData.content);
                  }
                  break;
                  
                case "complete":
                  this.notifyAnalysis(jsonData.message || "", jsonData.history);
                  break;
                  
                default:
                  // If no specific status, check if it's a message from another participant
                  if (jsonData.name && jsonData.content) {
                    // Standard message format
                    this.notifyMessage(jsonData.name, jsonData.content);
                  } else if (jsonData.user_name && jsonData.content) {
                    // Alternative format with user_name instead of name
                    this.notifyMessage(jsonData.user_name, jsonData.content);
                  } else if (jsonData.user_name && jsonData.message) {
                    // Legacy format support
                    this.notifyMessage(jsonData.user_name, jsonData.message);
                  }
              }
            } catch (e) {
              console.error("Error parsing WebSocket message:", e);
              this.notifyError("Invalid message received from server");
            }
          }
        };
        
        this.ws.onclose = () => {
          this.isConfigured = false;
          this.notifyStatusChange("disconnected");
          console.log("WebSocket connection closed");
        };
        
      } catch (error) {
        console.error("Error configuring group discussion:", error);
        this.notifyError("Failed to configure group discussion");
        reject(error);
      }
    });
  }

  public async startRecording(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error("Discussion is not configured. Call configure() first.");
    }
    try {
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      
      // Create audio context with correct sample rate
      const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Match server's SAMPLE_RATE
      });
      this.audioContext = audioContext;
      
      // Create audio source from microphone stream
      const source = audioContext.createMediaStreamSource(stream);
      this.source = source;
      
      // Create script processor for raw audio access
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      this.processor = processor;
      
      // Process audio data
      processor.onaudioprocess = (e) => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isAudioPaused) {
          // Get raw PCM data from input channel
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array (16-bit PCM)
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Convert float (-1.0 to 1.0) to int16 (-32768 to 32767)
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          // Send the PCM data to the server
          this.ws.send(pcmData.buffer);
        }
      };
      
      // Connect the audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      this.isRecording = true;
      this.notifyStatusChange("recording");
      console.log("Recording started with correct audio parameters");
    } catch (error) {
      console.error("Error starting recording:", error);
      this.notifyError("Failed to start recording");
      throw error;
    }
  }

  public stopRecording(): void {
    // Disconnect and clean up audio processing
    if (this.source && this.processor) {
      this.source.disconnect();
      this.processor.disconnect();
    }
    // Stop all tracks in the stream
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    // Close the audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.isRecording = false;
    this.notifyStatusChange("paused");
    console.log("Recording stopped");
  }

  public pauseAudio(): void {
    if (!this.isRecording) return;
    this.isAudioPaused = true;
    this.notifyStatusChange("muted");
    console.log("Microphone muted - audio transmission paused");
  }

  public resumeAudio(): void {
    if (!this.isRecording) return;
    this.isAudioPaused = false;
    this.notifyStatusChange("recording");
    console.log("Microphone unmuted - audio transmission resumed");
  }

  public requestAnalysis(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "ANALYSIS" }));
      this.notifyStatusChange("analyzing");
    } else {
      this.notifyError("Cannot request analysis: connection is not open");
    }
  }

  public disconnect(): void {
    this.stopRecording();
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConfigured = false;
    this.notifyStatusChange("disconnected");
    console.log("Disconnected from group discussion, all resources cleaned up");
  }

  public get configured(): boolean {
    return this.isConfigured;
  }

  public get recording(): boolean {
    return this.isRecording;
  }

  public get audioPaused(): boolean {
    return this.isAudioPaused;
  }

  public get discussionId(): string | null {
    return this.discussionCode;
  }

  public get topic(): string | null {
    return this.discussionTopic;
  }

  private notifyMessage(name: string, content: string): void {
    this.onMessageListeners.forEach(listener => listener(name, content));
  }

  private notifyStatusChange(status: string, details?: any): void {
    this.onStatusChangeListeners.forEach(listener => listener(status, details));
  }

  private notifyError(error: string): void {
    this.onErrorListeners.forEach(listener => listener(error));
  }

  private notifyParticipantChange(userName: string, isJoining: boolean, activeCount: number): void {
    this.onParticipantListeners.forEach(listener => listener(userName, isJoining, activeCount));
  }

  private notifyAnalysis(analysis: string, history?: DiscussionMessage[]): void {
    this.onAnalysisListeners.forEach(listener => listener(analysis, history));
  }
}