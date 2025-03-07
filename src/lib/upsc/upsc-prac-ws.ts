
export interface UPSCInterviewConfig {
  user_info: {
    name: string;
    education: string;
    hobbies?: string;
    achievements?: string;
    background?: string;
    optional_info?: string;
  };
  num_questions?: number;
}

export interface UPSCInterviewResponse {
  status?: string;
  message?: string;
  question?: string;
  board_member?: string;
  feedback?: string;
  setup_info?: any;
  is_final?: boolean;
}

export interface UPSCInterviewSummary {
  questions: Array<{
    board_member: string;
    question: string;
    answer: string;
    feedback?: string;
  }>;
  overall_feedback: string;
  scores?: {
    communication: number;
    knowledge: number;
    presence: number;
    overall: number;
  };
}

export type UPSCEventListener = (message: any) => void;

export class UPSCInterviewWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConfigured = false;
  private isAudioPaused = false;
  private onQuestionListeners: ((question: UPSCInterviewResponse) => void)[] = [];
  private onStatusChangeListeners: ((status: string) => void)[] = [];
  private onErrorListeners: ((error: string) => void)[] = [];
  private onSummaryListeners: ((summary: UPSCInterviewSummary) => void)[] = [];
  private onSetupInfoListeners: ((setupInfo: any) => void)[] = [];

  constructor(private serverUrl: string = "ws://localhost:8766") {}

  public addQuestionListener(listener: (question: UPSCInterviewResponse) => void): void {
    this.onQuestionListeners.push(listener);
  }

  public addStatusChangeListener(listener: (status: string) => void): void {
    this.onStatusChangeListeners.push(listener);
  }

  public addErrorListener(listener: (error: string) => void): void {
    this.onErrorListeners.push(listener);
  }

  public addSummaryListener(listener: (summary: UPSCInterviewSummary) => void): void {
    this.onSummaryListeners.push(listener);
  }

  public addSetupInfoListener(listener: (setupInfo: any) => void): void {
    this.onSetupInfoListeners.push(listener);
  }

  public configure(config: UPSCInterviewConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        
        this.ws.onopen = () => {
          console.log("WebSocket connected, sending UPSC interview configuration");
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
              const jsonData = JSON.parse(event.data);
              
              if (jsonData.status === "ready") {
                this.isConfigured = true;
                this.notifyStatusChange("ready");
                
                if (jsonData.setup_info) {
                  this.notifySetupInfo(jsonData.setup_info);
                }
                
                resolve();
              } else if (jsonData.status === "error") {
                this.notifyError(jsonData.message);
                reject(new Error(jsonData.message));
              } else if (jsonData.status === "goodbye") {
                this.isConfigured = false;
                this.notifyStatusChange("complete");
              } else if (jsonData.status === "summary") {
                if (jsonData.data) {
                  this.notifySummary(jsonData.data);
                }
              } else if (jsonData.question || jsonData.board_member) {
                // This is a question from a board member
                this.notifyQuestion(jsonData);
              }
            } catch (e) {
              // If parsing fails, treat as regular message
              console.warn("Non-JSON message received:", event.data);
            }
          }
        };
        
        this.ws.onclose = () => {
          this.isConfigured = false;
          this.notifyStatusChange("disconnected");
          console.log("WebSocket connection closed");
        };
        
      } catch (error) {
        console.error("Error configuring UPSC interview:", error);
        this.notifyError("Failed to configure UPSC interview");
        reject(error);
      }
    });
  }

  public async startRecording(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error("UPSC Interview is not configured. Call configure() first.");
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
    
    // Disconnect the processor but keep the stream and context alive
    this.isAudioPaused = true;
    console.log("Microphone paused - audio transmission stopped");
    this.notifyStatusChange("muted");
  }

  public resumeAudio(): void {
    if (!this.isRecording) return;
    
    this.isAudioPaused = false;
    console.log("Microphone resumed - audio transmission restarted");
    this.notifyStatusChange("recording");
  }

  public submitTextAnswer(answer: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "TEXT_ANSWER",
        answer: answer
      }));
    } else {
      this.notifyError("Cannot submit answer: connection is not open");
    }
  }

  public requestSummary(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "SUMMARY" }));
    } else {
      this.notifyError("Cannot request summary: connection is not open");
    }
  }

  public endInterview(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "END_INTERVIEW" }));
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
    console.log("Disconnected, all resources cleaned up");
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

  private notifyQuestion(question: UPSCInterviewResponse): void {
    this.onQuestionListeners.forEach(listener => listener(question));
  }

  private notifyStatusChange(status: string): void {
    this.onStatusChangeListeners.forEach(listener => listener(status));
  }

  private notifyError(error: string): void {
    this.onErrorListeners.forEach(listener => listener(error));
  }

  private notifySummary(summary: UPSCInterviewSummary): void {
    this.onSummaryListeners.forEach(listener => listener(summary));
  }

  private notifySetupInfo(setupInfo: any): void {
    this.onSetupInfoListeners.forEach(listener => listener(setupInfo));
  }
}
