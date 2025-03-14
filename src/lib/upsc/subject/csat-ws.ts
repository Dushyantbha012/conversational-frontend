export interface CSATConfig {
  difficulty?: "easy" | "medium" | "hard";
  language?: "english" | "hindi";
}

export interface CSATResponse {
  status?: string;
  message?: string;
  language?: string;
}

export type CSATEventListener = (message: string) => void;

export class CSATWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConfigured = false;
  private isAudioPaused = false;
  private onMessageListeners: CSATEventListener[] = [];
  private onStatusChangeListeners: ((status: string) => void)[] = [];
  private onErrorListeners: ((error: string) => void)[] = [];
  private onLanguagePromptListeners: ((options: string[]) => void)[] = [];
  private selectedLanguage: string = "english";

  constructor(private serverUrl: string = "ws://localhost:8766") {}

  public addMessageListener(listener: CSATEventListener): void {
    this.onMessageListeners.push(listener);
  }

  public addStatusChangeListener(listener: (status: string) => void): void {
    this.onStatusChangeListeners.push(listener);
  }

  public addErrorListener(listener: (error: string) => void): void {
    this.onErrorListeners.push(listener);
  }
  
  public addLanguagePromptListener(listener: (options: string[]) => void): void {
    this.onLanguagePromptListeners.push(listener);
  }

  public configure(config: CSATConfig = {}): Promise<void> {
    // Store language preference if provided in config
    if (config.language) {
      this.selectedLanguage = config.language;
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        
        this.ws.onopen = () => {
          console.log("WebSocket connected, sending CSAT configuration");
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
              
              // Handle language selection prompt
              if (jsonData.status === "language_selection") {
                console.log("Language selection prompt received:", jsonData);
                if (jsonData.options && Array.isArray(jsonData.options)) {
                  this.notifyLanguagePrompt(jsonData.options);
                }
                this.notifyMessage(jsonData.message || "Please select a language");
                // Don't resolve the promise yet, wait for language selection
              }
              else if (jsonData.status === "ready") {
                // Store language if provided
                if (jsonData.language) {
                  this.selectedLanguage = jsonData.language;
                }
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
                
                // Update language preference if specified in response
                if (jsonData.language) {
                  this.selectedLanguage = jsonData.language;
                }
              } else if (jsonData.english && jsonData.hindi) {
                // Handle responses with multiple language options
                const message = this.selectedLanguage === "hindi" ? 
                  jsonData.hindi : jsonData.english;
                this.notifyMessage(message);
              } else if (jsonData.preferred) {
                // Handle responses with a preferred language field
                this.notifyMessage(jsonData.preferred);
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
        console.error("Error configuring CSAT interview:", error);
        this.notifyError("Failed to configure CSAT interview");
        reject(error);
      }
    });
  }

  // Send language preference to the server
  public selectLanguage(language: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.selectedLanguage = language.toLowerCase();
      this.ws.send(JSON.stringify({
        type: "LANGUAGE_SELECTION",
        language: this.selectedLanguage
      }));
      console.log(`Language preference sent: ${this.selectedLanguage}`);
    } else {
      console.error("Cannot send language preference: connection not open");
    }
  }
  
  public getSelectedLanguage(): string {
    return this.selectedLanguage;
  }

  public async startRecording(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error("CSAT interview is not configured. Call configure() first.");
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
      console.log("CSAT recording started with correct audio parameters");
    } catch (error) {
      console.error("Error starting CSAT recording:", error);
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
    console.log("CSAT recording stopped");
  }

  public pauseAudio(): void {
    if (!this.isRecording) return;
    
    this.isAudioPaused = true;
    this.notifyStatusChange("muted");
    console.log("CSAT microphone paused - audio transmission stopped");
  }

  public resumeAudio(): void {
    if (!this.isRecording || !this.isAudioPaused) return;
    
    this.isAudioPaused = false;
    this.notifyStatusChange("recording");
    console.log("CSAT microphone resumed - audio transmission restarted");
  }

  public endInterview(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "END_INTERVIEW" }));
      this.notifyMessage("Ending CSAT interview...");
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
    console.log("Disconnected from CSAT interview, all resources cleaned up");
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
  
  private notifyLanguagePrompt(options: string[]): void {
    this.onLanguagePromptListeners.forEach(listener => listener(options));
  }
}
