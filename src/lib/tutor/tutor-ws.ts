export interface TutorExplanation {
  type: string;
  question: string;
  explanation: string;
  conversation_length?: number;
}

export interface ImageProcessedResponse {
  type: string;
  message: string;
  description: string;
}

export interface ErrorResponse {
  type: string;
  message: string;
}

export interface StatusResponse {
  type: string;
  message: string;
}

export type TutorEventListener = (message: string) => void;
export type ExplanationListener = (explanation: TutorExplanation) => void;
export type ImageProcessedListener = (response: ImageProcessedResponse) => void;
export type ErrorListener = (error: ErrorResponse) => void;
export type StatusListener = (status: StatusResponse) => void;

export class TutorWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConfigured = false;
  private isAudioPaused = false;
  private onMessageListeners: TutorEventListener[] = [];
  private onExplanationListeners: ExplanationListener[] = [];
  private onImageProcessedListeners: ImageProcessedListener[] = [];
  private onErrorListeners: ErrorListener[] = [];
  private onStatusListeners: StatusListener[] = [];
  private onStatusChangeListeners: ((status: string) => void)[] = [];
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private connectionTimeoutId: NodeJS.Timeout | null = null;

  constructor(private serverUrl: string = "wss://ws3.nextround.tech/tutor") {}

  public addMessageListener(listener: TutorEventListener): void {
    this.onMessageListeners.push(listener);
  }

  public addExplanationListener(listener: ExplanationListener): void {
    this.onExplanationListeners.push(listener);
  }

  public addImageProcessedListener(listener: ImageProcessedListener): void {
    this.onImageProcessedListeners.push(listener);
  }

  public addErrorListener(listener: ErrorListener): void {
    this.onErrorListeners.push(listener);
  }

  public addStatusListener(listener: StatusListener): void {
    this.onStatusListeners.push(listener);
  }

  public addStatusChangeListener(listener: (status: string) => void): void {
    this.onStatusChangeListeners.push(listener);
  }

  public configure(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Clear any existing WebSocket
        if (this.ws) {
          this.ws.close();
          this.ws = null;
        }

        console.log(`Attempting to connect to WebSocket at ${this.serverUrl}`);
        
        // Create a new WebSocket connection
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        
        // Set connection timeout
        this.connectionTimeoutId = setTimeout(() => {
          console.error("WebSocket connection timeout");
          this.notifyError({ type: "error", message: "Connection timeout" });
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            this.tryReconnect(reject);
          }
        }, 10000); // 10 second timeout
        
        this.ws.onopen = () => {
          console.log("WebSocket connected to tutor service");
          if (this.connectionTimeoutId) {
            clearTimeout(this.connectionTimeoutId);
            this.connectionTimeoutId = null;
          }
          this.reconnectAttempts = 0;
          this.isConfigured = true;
          this.notifyStatusChange("connected");
          resolve();
        };
        
        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.notifyError({ 
            type: "error", 
            message: `Connection error occurred: ${JSON.stringify(error)}`
          });
          this.tryReconnect(reject);
        };
        
        this.ws.onmessage = (event) => {
          if (typeof event.data === "string") {
            try {
              // Handle JSON messages
              const jsonData = JSON.parse(event.data);
              console.log("Received JSON message:", jsonData);
              
              if (jsonData.type === "explanation") {
                this.notifyExplanation(jsonData);
              } else if (jsonData.type === "image_processed") {
                this.notifyImageProcessed(jsonData);
              } else if (jsonData.type === "error") {
                this.notifyError(jsonData);
              } else if (jsonData.type === "status") {
                this.notifyStatus(jsonData);
              } else if (jsonData.type === "goodbye") {
                this.notifyStatusChange("disconnected");
                this.notifyStatus(jsonData);
              } else if (jsonData.status === "ready") {
                this.notifyStatusChange("ready");
                this.notifyMessage(jsonData.message);
              }
            } catch (e) {
              // If not JSON, treat as regular message
              this.notifyMessage(event.data);
            }
          }
        };
        
        this.ws.onclose = (event) => {
          this.isConfigured = false;
          console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
          this.notifyStatusChange("disconnected");
          
          // If it wasn't a normal closure, attempt to reconnect
          if (event.code !== 1000) {
            this.tryReconnect(reject);
          }
        };
        
      } catch (error) {
        console.error("Error configuring tutor:", error);
        this.notifyError({ 
          type: "error", 
          message: `Failed to configure tutor connection: ${error instanceof Error ? error.message : String(error)}`
        });
        reject(error);
      }
    });
  }

  private tryReconnect(reject: (reason?: any) => void): void {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      this.notifyMessage(`Reconnecting... Attempt ${this.reconnectAttempts}`);
      
      // Try to reconnect after a delay
      setTimeout(() => {
        this.configure().catch(reject);
      }, 2000); // 2 second delay between reconnect attempts
    } else {
      console.error("Maximum reconnection attempts reached");
      this.notifyError({ type: "error", message: "Failed to connect after multiple attempts" });
      reject(new Error("Maximum reconnection attempts reached"));
    }
  }

  public async startRecording(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error("Tutor is not configured. Call configure() first.");
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
      this.notifyError({ type: "error", message: "Failed to start recording" });
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
    console.log("Audio transmission paused");
  }

  public resumeAudio(): void {
    if (!this.isRecording) return;
    this.isAudioPaused = false;
    this.notifyStatusChange("recording");
    console.log("Audio transmission resumed");
  }

  public sendQuestion(question: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "question",
        text: question
      }));
      console.log("Question sent:", question);
    } else {
      console.error("Cannot send question: WebSocket not ready");
    }
  }

  public sendImageForProcessing(imageUrl: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "image",
        url: imageUrl
      }));
      console.log("Image URL sent for processing:", imageUrl);
    } else {
      console.error("Cannot send image URL: WebSocket not ready");
    }
  }

  public clearHistory(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "clear_history"
      }));
      console.log("Request to clear conversation history sent");
    } else {
      console.error("Cannot clear history: WebSocket not ready");
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
    console.log("Disconnected from tutor service");
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

  private notifyMessage(message: string): void {
    this.onMessageListeners.forEach(listener => listener(message));
  }

  private notifyExplanation(explanation: TutorExplanation): void {
    this.onExplanationListeners.forEach(listener => listener(explanation));
  }

  private notifyImageProcessed(response: ImageProcessedResponse): void {
    this.onImageProcessedListeners.forEach(listener => listener(response));
  }

  private notifyError(error: ErrorResponse): void {
    this.onErrorListeners.forEach(listener => listener(error));
  }

  private notifyStatus(status: StatusResponse): void {
    this.onStatusListeners.forEach(listener => listener(status));
  }

  private notifyStatusChange(status: string): void {
    this.onStatusChangeListeners.forEach(listener => listener(status));
  }
}
