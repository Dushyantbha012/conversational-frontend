export interface TutorResponse {
  type?: string;
  question?: string;
  explanation?: string;
  message?: string;
  status?: string;
  description?: string;
  conversation_length?: number;
}

export type TutorEventListener = (message: string) => void;
export type TutorExplanationListener = (question: string, explanation: string) => void;
export type TutorImageProcessedListener = (description: string) => void;

export class TutorWebSocket {
  private ws: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private isRecording = false;
  private isConnected = false;
  private isAudioPaused = false;
  private imagesSent = 0;
  private readonly MAX_IMAGES = 5;
  private onMessageListeners: TutorEventListener[] = [];
  private onStatusChangeListeners: ((status: string) => void)[] = [];
  private onErrorListeners: ((error: string) => void)[] = [];
  private onExplanationListeners: ((question: string, explanation: string) => void)[] = [];
  private onImageProcessedListeners: ((description: string) => void)[] = [];

  constructor(private serverUrl: string = "ws://localhost:8766") {}

  public addMessageListener(listener: TutorEventListener): void {
    this.onMessageListeners.push(listener);
  }

  public addStatusChangeListener(listener: (status: string) => void): void {
    this.onStatusChangeListeners.push(listener);
  }

  public addErrorListener(listener: (error: string) => void): void {
    this.onErrorListeners.push(listener);
  }

  public addExplanationListener(listener: (question: string, explanation: string) => void): void {
    this.onExplanationListeners.push(listener);
  }

  public addImageProcessedListener(listener: (description: string) => void): void {
    this.onImageProcessedListeners.push(listener);
  }

  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        this.ws.binaryType = "arraybuffer";
        
        this.ws.onopen = () => {
          console.log("WebSocket connected to tutor service");
          this.isConnected = true;
          this.imagesSent = 0; // Reset image counter on new connection
          this.notifyStatusChange("connected");
          resolve();
        };
        
        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          this.notifyError("Connection error occurred");
          reject(error);
        };
        
        this.ws.onmessage = (event) => {
          if (typeof event.data === "string") {
            try {
              // Handle JSON messages
              const jsonData = JSON.parse(event.data) as TutorResponse;
              
              if (jsonData.status === "ready") {
                this.notifyStatusChange("ready");
                this.notifyMessage("NCERT Tutor is ready. You can ask questions about your NCERT textbooks.");
              } else if (jsonData.status === "error") {
                this.notifyError(jsonData.message || "An error occurred");
              } else if (jsonData.status === "goodbye") {
                this.notifyStatusChange("disconnected");
                this.notifyMessage(jsonData.message || "Session ended");
              } else if (jsonData.type === "explanation") {
                // Handle explanation response
                this.notifyExplanation(
                  jsonData.question || "", 
                  jsonData.explanation || "No explanation provided"
                );
                this.notifyMessage(`Q: ${jsonData.question}\n\nA: ${jsonData.explanation}`);
              } else if (jsonData.type === "image_processed") {
                // Handle image processing response
                this.notifyMessage(`Image processed: ${jsonData.message}`);
                if (jsonData.description) {
                  this.notifyImageProcessed(jsonData.description);
                }
              } else {
                // Handle any other message
                this.notifyMessage(jsonData.message || "");
              }
            } catch (e) {
              // If not JSON, treat as regular message
              this.notifyMessage(event.data);
            }
          }
        };
        
        this.ws.onclose = () => {
          this.isConnected = false;
          this.notifyStatusChange("disconnected");
          console.log("WebSocket connection to tutor closed");
        };
        
      } catch (error) {
        console.error("Error connecting to tutor service:", error);
        this.notifyError("Failed to connect to tutor service");
        reject(error);
      }
    });
  }

  public sendTextQuestion(question: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "question",
        text: question
      }));
      this.notifyMessage(`You asked: ${question}`);
    } else {
      this.notifyError("Cannot send question: not connected to tutor");
    }
  }

  public sendImage(imageUrl: string): boolean {
    if (this.imagesSent >= this.MAX_IMAGES) {
      this.notifyError(`Cannot send more than ${this.MAX_IMAGES} images per session`);
      return false;
    }
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "image",
        url: imageUrl
      }));
      this.imagesSent++;
      this.notifyMessage(`Sending image for analysis (${this.imagesSent}/${this.MAX_IMAGES})`);
      this.notifyStatusChange("processing_image");
      return true;
    } else {
      this.notifyError("Cannot send image: not connected to tutor");
      return false;
    }
  }

  public clearHistory(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "clear_history"
      }));
      this.notifyMessage("Conversation history cleared");
    } else {
      this.notifyError("Cannot clear history: not connected to tutor");
    }
  }

  public async startRecording(): Promise<void> {
    if (!this.isConnected) {
      throw new Error("Not connected to tutor. Call connect() first.");
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

  // Add methods to pause and resume audio transmission
  public pauseAudio(): void {
    if (!this.isRecording) return;
    
    this.isAudioPaused = true;
    this.notifyStatusChange("muted");
    console.log("Microphone paused - audio transmission stopped");
  }

  public resumeAudio(): void {
    if (!this.isRecording) return;
    
    this.isAudioPaused = false;
    this.notifyStatusChange("recording");
    console.log("Microphone resumed - audio transmission restarted");
  }

  public disconnect(): void {
    this.stopRecording();
    
    // Close WebSocket connection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.imagesSent = 0; // Reset image counter
    this.notifyStatusChange("disconnected");
    console.log("Disconnected, all resources cleaned up");
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  public get recording(): boolean {
    return this.isRecording;
  }

  public get audioPaused(): boolean {
    return this.isAudioPaused;
  }

  public get remainingImages(): number {
    return Math.max(0, this.MAX_IMAGES - this.imagesSent);
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

  private notifyExplanation(question: string, explanation: string): void {
    this.onExplanationListeners.forEach(listener => listener(question, explanation));
  }

  private notifyImageProcessed(description: string): void {
    this.onImageProcessedListeners.forEach(listener => listener(description));
  }
}
