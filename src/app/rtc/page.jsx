"use client";
import { useEffect, useRef, useState } from "react";

export default function AudioStreamer() {
  const [isRecording, setIsRecording] = useState(false);
  const [aiResponses, setAiResponses] = useState([]);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const responseEndRef = useRef(null);

  useEffect(() => {
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording]);

  useEffect(() => {
    // Auto-scroll to the bottom when new responses arrive
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiResponses]);

  const startRecording = async () => {
    try {
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create audio context with correct sample rate
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000, // Match server's SAMPLE_RATE
      });
      audioContextRef.current = audioContext;

      // Create audio source from microphone stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create script processor for raw audio access
      // Note: ScriptProcessorNode is deprecated but still widely supported
      // The replacement AudioWorkletNode requires more complex setup
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      // Connect WebSocket to server
      wsRef.current = new WebSocket("ws://localhost:8765");
      wsRef.current.binaryType = "arraybuffer";
      
      wsRef.current.onopen = () => console.log("WebSocket connected");
      wsRef.current.onerror = (error) => console.error("WebSocket error:", error);
      
      // Handle incoming messages from the server
      wsRef.current.onmessage = (event) => {
        const response = event.data;
        console.log("Received AI response:", response);
        setAiResponses(prev => [...prev, response]);
      };

      // Process audio data
      processor.onaudioprocess = (e) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          // Get raw PCM data from input channel
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert Float32Array to Int16Array (16-bit PCM)
          // This matches the SAMPLE_WIDTH of 2 bytes in the server
          const pcmData = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            // Convert float (-1.0 to 1.0) to int16 (-32768 to 32767)
            pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
          }
          
          // Send the PCM data to the server
          wsRef.current.send(pcmData.buffer);
        }
      };

      // Connect the audio nodes
      source.connect(processor);
      processor.connect(audioContext.destination);
      
      console.log("Recording started with correct audio parameters");
    } catch (error) {
      console.error("Error starting recording:", error);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    // Disconnect and clean up audio processing
    if (sourceRef.current && processorRef.current) {
      sourceRef.current.disconnect();
      processorRef.current.disconnect();
    }
    
    // Stop all tracks in the stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    // Close the audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    
    // Close WebSocket connection
    if (wsRef.current) {
      wsRef.current.onclose = () => {
        console.log("WebSocket closed");
      };
      wsRef.current.close();
    }
    
    console.log("Recording stopped, all resources cleaned up");
  };

  const clearResponses = () => {
    setAiResponses([]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">Audio Assistant</h1>
          <div className="flex justify-between mb-4">
            <button 
              onClick={() => setIsRecording(!isRecording)}
              className={`px-4 py-2 rounded-md font-medium text-white ${
                isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
              }`}
            >
              {isRecording ? "Stop Recording" : "Start Recording"}
            </button>
            
            <button
              onClick={clearResponses}
              className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
            >
              Clear Responses
            </button>
          </div>
          
          <p className="mb-4 text-gray-600">
            {isRecording 
              ? "Recording in progress... Speak now and responses will appear below." 
              : "Click 'Start Recording' to begin."}
          </p>
        </div>
        
        {aiResponses.length > 0 && (
          <div className="border-t border-gray-200">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-3">AI Responses</h2>
              <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto">
                {aiResponses.map((response, index) => (
                  <div key={index} className="mb-3 pb-3 border-b border-gray-200 last:border-b-0">
                    <p className="whitespace-pre-wrap text-gray-800">{response}</p>
                  </div>
                ))}
                <div ref={responseEndRef} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
