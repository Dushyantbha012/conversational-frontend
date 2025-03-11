export interface InterviewConfig {
  resume_text: string;
  resume_pdf?: string;
  number_of_ques?: number;
  difficulty?: "easy" | "medium" | "hard";
  language?: "english" | "hindi";
}

export interface InterviewScore {
  role: string;
  content: string;
  score?: number;
}

export interface InterviewResponse {
  status?: string;
  message?: string;
  history?: InterviewScore[];
  language?: string;
}

export type InterviewEventListener = (message: string) => void;

export class InterviewWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConfigured = false;
  private isAudioPaused = false;
  private onMessageListeners: InterviewEventListener[] = [];
  private onStatusChangeListeners: ((status: string) => void)[] = [];
  private onErrorListeners: ((error: string) => void)[] = [];
  private onAnalysisListeners: ((analysis: string, scores?: InterviewScore[]) => void)[] = [];
  private onLanguagePromptListeners: ((options: string[]) => void)[] = [];
  private isWaitingForAnalysis = false;
  private analysisTimeout: NodeJS.Timeout | null = null;
  private selectedLanguage: string = "english";

  constructor(private serverUrl: string = "ws://localhost:8765") {}

  public addMessageListener(listener: InterviewEventListener): void {
    this.onMessageListeners.push(listener);
  }

  public addStatusChangeListener(listener: (status: string) => void): void {
    this.onStatusChangeListeners.push(listener);
  }

  public addErrorListener(listener: (error: string) => void): void {
    this.onErrorListeners.push(listener);
  }

  public addAnalysisListener(listener: (analysis: string, scores?: InterviewScore[]) => void): void {
    this.onAnalysisListeners.push(listener);
  }
  
  public addLanguagePromptListener(listener: (options: string[]) => void): void {
    this.onLanguagePromptListeners.push(listener);
  }

  public configure(config: InterviewConfig): Promise<void> {
    // Store language preference if provided in config
    if (config.language) {
      this.selectedLanguage = config.language;
    }
    
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        
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
          console.log("Received message:", event.data);
          if (typeof event.data === "string") {
            try {
              // Handle JSON status messages
              const jsonData = JSON.parse(event.data);
              console.log("Received JSON message:", jsonData);
              
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
                  console.log(`Language set to: ${this.selectedLanguage}`);
                }
                
                this.isConfigured = true;
                this.notifyStatusChange("ready");
                resolve();
              } else if (jsonData.status === "error") {
                this.notifyError(jsonData.message);
                reject(new Error(jsonData.message));
              } else if (jsonData.status === "goodbye") {
                console.log("Interview complete:", jsonData.message);
                this.isConfigured = false;
                this.notifyStatusChange("complete");
                this.notifyMessage(`✨ ${jsonData.message}`);
                
                // If language is provided in the goodbye message, update it
                if (jsonData.language) {
                  this.selectedLanguage = jsonData.language;
                }
                
                // Handle analysis data if available
                if (jsonData.history) {
                  console.log("Received history data:", jsonData.history);
                  // Ensure all history items have required fields
                  const processedHistory = jsonData.history.map((item: any) => ({
                    role: item.role || "system",
                    content: item.content || "",
                    score: item.score
                  }));
                  this.notifyAnalysis(jsonData.message, processedHistory);
                }

                // Clear analysis state when goodbye is received
                this.clearAnalysisState();
                
                // Don't disconnect immediately to allow processing of the final messages
                setTimeout(() => this.disconnect(), 1000);
              }
            } catch (e) {
              // If not JSON, treat as regular response
              this.notifyMessage(event.data);
              
              // This could be the analysis insight text
              if (this.isWaitingForAnalysis) {
                // Keep connection open for the goodbye message
                console.log("Received analysis text");
              }
            }
          }
        };
        
        this.ws.onclose = () => {
          this.isConfigured = false;
          this.notifyStatusChange("disconnected");
          console.log("WebSocket connection closed");
        };
        
      } catch (error) {
        console.error("Error configuring interview:", error);
        this.notifyError("Failed to configure interview");
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
      throw new Error("Interview is not configured. Call configure() first.");
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
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

  // Add methods to pause and resume audio transmission
  public pauseAudio(): void {
    if (!this.isRecording) return;
    
    // Disconnect the processor but keep the stream and context alive
    if (this.source && this.processor) {
      this.source.disconnect(this.processor);
      this.isAudioPaused = true;
      console.log("Microphone paused - audio transmission stopped");
      this.notifyStatusChange("muted");
    }
  }

  public resumeAudio(): void {
    if (!this.isRecording || !this.isAudioPaused) return;
    
    // Reconnect the audio processing chain
    if (this.source && this.processor && this.audioContext) {
      this.source.connect(this.processor);
      this.isAudioPaused = false;
      console.log("Microphone resumed - audio transmission restarted");
      this.notifyStatusChange("recording");
    }
  }

  public requestAnalysis(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.isWaitingForAnalysis = true;
      this.ws.send(JSON.stringify({ type: "ANALYSIS" }));
      this.notifyMessage("Requesting analysis of the interview...");
      
      // Set a timeout to handle cases where server doesn't respond
      this.analysisTimeout = setTimeout(() => {
        if (this.isWaitingForAnalysis) {
          this.notifyError("Analysis request timed out");
          this.isWaitingForAnalysis = false;
        }
      }, 20000); // 20-second timeout
    } else {
      this.notifyError("Cannot request analysis: connection is not open");
    }
  }

  public disconnect(): void {
    this.clearAnalysisState();
    this.stopRecording();
    
    // Close WebSocket connection
    if (this.ws) {
      // Don't reset isConfigured here, let the component handle that
      this.ws.close();
      this.ws = null;
    }
    
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

  private notifyMessage(message: string): void {
    this.onMessageListeners.forEach(listener => listener(message));
  }

  private notifyStatusChange(status: string): void {
    this.onStatusChangeListeners.forEach(listener => listener(status));
  }

  private notifyError(error: string): void {
    this.onErrorListeners.forEach(listener => listener(error));
  }

  private notifyAnalysis(message: string, scores?: InterviewScore[]): void {
    this.onAnalysisListeners.forEach(listener => listener(message, scores));
  }
  
  private notifyLanguagePrompt(options: string[]): void {
    this.onLanguagePromptListeners.forEach(listener => listener(options));
  }

  private clearAnalysisState(): void {
    if (this.isWaitingForAnalysis) {
      this.isWaitingForAnalysis = false;
      if (this.analysisTimeout) {
        clearTimeout(this.analysisTimeout);
        this.analysisTimeout = null;
      }
    }
  }
}
