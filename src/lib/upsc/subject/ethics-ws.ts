export interface EthicsConfig {
  difficulty?: "easy" | "medium" | "hard";
}

export interface EthicsResponse {
  status?: string;
  message?: string;
}

export type EthicsEventListener = (message: string) => void;

export class EthicsWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConfigured = false;
  private isAudioPaused = false;
  private onMessageListeners: EthicsEventListener[] = [];
  private onStatusChangeListeners: ((status: string) => void)[] = [];
  private onErrorListeners: ((error: string) => void)[] = [];

  constructor(private serverUrl: string = "ws://localhost:8767") {}

  public addMessageListener(listener: EthicsEventListener): void {
    this.onMessageListeners.push(listener);
  }

  public addStatusChangeListener(listener: (status: string) => void): void {
    this.onStatusChangeListeners.push(listener);
  }

  public addErrorListener(listener: (error: string) => void): void {
    this.onErrorListeners.push(listener);
  }

  public configure(config: EthicsConfig = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        
        this.ws.onopen = () => {
          console.log("WebSocket connected, sending Ethics configuration");
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
              // Try to parse as JSON for status messages
              const jsonData = JSON.parse(event.data);
              if (jsonData.status === "ready") {
                this.isConfigured = true;
                this.notifyStatusChange("ready");
                resolve();
              } else if (jsonData.status === "error") {
                this.notifyError(jsonData.message);
                reject(new Error(jsonData.message));
              } else if (jsonData.status === "goodbye") {
                this.isConfigured = false;
                this.notifyStatusChange("complete");
                this.notifyMessage(`✨ ${jsonData.message}`);
              }
            } catch (e) {
              // If not JSON, treat as regular interviewer response
              this.notifyMessage(event.data);
            }
          }
        };
        
        this.ws.onclose = () => {
          this.isConfigured = false;
          this.notifyStatusChange("disconnected");
          console.log("WebSocket connection closed");
        };
        
      } catch (error) {
        console.error("Error configuring Ethics interview:", error);
        this.notifyError("Failed to configure Ethics interview");
        reject(error);
      }
    });
  }

  public async startRecording(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error("Ethics interview is not configured. Call configure() first.");
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
      console.log("Ethics recording started with correct audio parameters");
    } catch (error) {
      console.error("Error starting Ethics recording:", error);
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
    console.log("Ethics recording stopped");
  }

  public pauseAudio(): void {
    if (!this.isRecording) return;
    
    this.isAudioPaused = true;
    this.notifyStatusChange("muted");
    console.log("Ethics microphone paused - audio transmission stopped");
  }

  public resumeAudio(): void {
    if (!this.isRecording || !this.isAudioPaused) return;
    
    this.isAudioPaused = false;
    this.notifyStatusChange("recording");
    console.log("Ethics microphone resumed - audio transmission restarted");
  }

  public endInterview(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "END_INTERVIEW" }));
      this.notifyMessage("Ending Ethics interview...");
    } else {
      this.notifyError("Cannot end interview: connection is not open");
    }
  }

  public sendMessage(message: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      this.notifyError("Cannot send message: connection is not open");
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
    console.log("Disconnected from Ethics interview, all resources cleaned up");
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

  private notifyStatusChange(status: string): void {
    this.onStatusChangeListeners.forEach(listener => listener(status));
  }

  private notifyError(error: string): void {
    this.onErrorListeners.forEach(listener => listener(error));
  }
}
