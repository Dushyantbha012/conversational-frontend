"use client";
import { useEffect, useRef, useState } from "react";
import React = require("react");
interface InterviewConfig {
  resume_text: string;
  resume_pdf?: string;
  number_of_ques?: number;
  difficulty?: "easy" | "medium" | "hard";
}

export default function InterviewAssistant() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [aiResponses, setAiResponses] = useState<string[]>([]);
  const [resumeText, setResumeText] = useState<string>("");
  const [resumeUrl, setResumeUrl] = useState<string>(""); // Add state for resume URL
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [interviewComplete, setInterviewComplete] = useState<boolean>(false);
  const [finalMessage, setFinalMessage] = useState<string>("");
  // Add state for analysis
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [isAnalysisRequested, setIsAnalysisRequested] = useState<boolean>(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isRecording && isConfigured) {
      startRecording();
    } else {
      stopRecording();
    }
  }, [isRecording, isConfigured]);

  useEffect(() => {
    // Auto-scroll to the bottom when new responses arrive
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiResponses]);

  const configureAndStartInterview = () => {
    if (!resumeText.trim() && !resumeUrl.trim()) {
      alert("Please provide either resume text or a resume PDF URL to start the interview");
      return;
    }
    
    try {
      wsRef.current = new WebSocket("ws://localhost:8765");
      wsRef.current.binaryType = "arraybuffer";
      
      wsRef.current.onopen = () => {
        console.log("WebSocket connected, sending configuration");
        const config: InterviewConfig = {
          resume_text: resumeText,
          number_of_ques: numberOfQuestions,
          difficulty: difficulty as "easy" | "medium" | "hard"
        };
        
        // Add resume PDF URL if provided
        if (resumeUrl.trim()) {
          config.resume_pdf = resumeUrl;
        }
        
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify(config));
        }
      };
      
      wsRef.current.onerror = (error) => console.error("WebSocket error:", error);
      
      wsRef.current.onmessage = (event) => {
        if (typeof event.data === "string") {
          try {
            // Handle JSON status messages
            const jsonData = JSON.parse(event.data);
            if (jsonData.status === "ready") {
              setIsConfigured(true);
              // Automatically start recording once configured
              setIsRecording(true);
              setAiResponses(prev => [...prev, "Interview assistant is ready. Starting with the first question..."]);
            } else if (jsonData.status === "error") {
              setAiResponses(prev => [...prev, `Error: ${jsonData.message}`]);
            } else if (jsonData.status === "goodbye") {
              // Handle the goodbye message
              setInterviewComplete(true);
              setIsRecording(false);
              setFinalMessage(jsonData.message);
              
              // Store and display history if available
              if (jsonData.history) {
                const historyText = formatHistory(jsonData.history);
                setAnalysisResult(historyText);
                console.log("Analysis response received:", jsonData.history);
              }
              
              setAiResponses(prev => [...prev, `✨ ${jsonData.message}`]);
            } else if (jsonData.type === "ANALYSIS_RESPONSE") {
              console.log("Analysis response received:", jsonData);
              
              // If there's analysis data in the response
              if (jsonData.analysis) {
                console.log("Analysis content:", jsonData.analysis);
              }
              
              if (jsonData.history) {
                console.log("Interview history:", jsonData.history);
              }
            }
          } catch (e) {
            // If not JSON, treat as regular response
            console.log("Received AI response:", event.data);
            setAiResponses(prev => [...prev, event.data]);
          }
        } else {
          // Binary data - should not happen with this server
          console.log("Received binary data");
        }
      };
    } catch (error) {
      console.error("Error configuring interview:", error);
    }
  };

  // Add function to format history data
  const formatHistory = (history) => {
    return history.map((item, index) => {
      return `${index + 1}. ${item.role.toUpperCase()}: ${item.content}`;
    }).join('\n\n');
  };

  // Add function to request analysis
  const requestAnalysis = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      setIsAnalysisRequested(true);
      wsRef.current.send(JSON.stringify({ type: "ANALYSIS" }));
      setAiResponses(prev => [...prev, "Requesting analysis of the interview..."]);
    }
  };

  const startRecording = async () => {
    try {
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create audio context with correct sample rate
      const audioContext = new ((window as any).AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 16000, // Match server's SAMPLE_RATE
      });
      audioContextRef.current = audioContext;

      // Create audio source from microphone stream
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create script processor for raw audio access
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
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
    
    setIsConfigured(false);
    console.log("Recording stopped, all resources cleaned up");
  };

  const clearResponses = () => {
    setAiResponses([]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">Interview Assistant</h1>
          
          {!isConfigured ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="resume-url" className="block text-sm font-medium text-gray-700 mb-1">
                  Resume PDF URL (optional):
                </label>
                <input
                  type="url"
                  id="resume-url"
                  value={resumeUrl}
                  onChange={(e) => setResumeUrl(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="https://example.com/resume.pdf"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Enter a URL to your resume PDF or use the text field below.
                </p>
              </div>
              
              <div>
                <label htmlFor="resume-text" className="block text-sm font-medium text-gray-700 mb-1">
                  Paste your resume text (optional if URL provided):
                </label>
                <textarea 
                  id="resume-text"
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  className="w-full h-40 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Copy and paste your resume text here..."
                ></textarea>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="num-questions" className="block text-sm font-medium text-gray-700 mb-1">
                    Number of Questions:
                  </label>
                  <input
                    type="number"
                    id="num-questions"
                    value={numberOfQuestions}
                    onChange={(e) => setNumberOfQuestions(Number(e.target.value))}
                    min="1"
                    max="20"
                    className="w-full p-2 border border-gray-300 rounded-md"
                  />
                </div>
                
                <div>
                  <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
                    Difficulty Level:
                  </label>
                  <select
                    id="difficulty"
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              
              <button
                onClick={configureAndStartInterview}
                className="px-4 py-2 rounded-md font-medium text-white bg-blue-500 hover:bg-blue-600 w-full"
              >
                Start Interview
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between mb-4">
                <button 
                  onClick={() => setIsRecording(!isRecording)}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                  }`}
                  disabled={interviewComplete}
                >
                  {isRecording ? "Pause Interview" : "Resume Interview"}
                </button>
                
                <button
                  onClick={requestAnalysis}
                  className="px-4 py-2 rounded-md font-medium text-white bg-green-500 hover:bg-green-600"
                  disabled={interviewComplete || isAnalysisRequested}
                >
                  {isAnalysisRequested ? "Analysis Requested..." : "End & Get Analysis"}
                </button>
                
                <button
                  onClick={clearResponses}
                  className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
                >
                  Clear Responses
                </button>
              </div>
              
              <p className="mb-4 text-gray-600">
                {interviewComplete 
                  ? "Interview complete! Thank you for participating."
                  : isRecording 
                    ? "Recording in progress... Answer the questions and wait for follow-up questions." 
                    : "Click 'Resume Interview' to continue."}
              </p>

              {interviewComplete && finalMessage && (
                <div className="mb-4 p-4 bg-green-50 border border-green-100 rounded-md text-center">
                  <p className="text-green-800 font-medium">{finalMessage}</p>
                </div>
              )}
              
              {/* Display analysis result */}
              {analysisResult && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-md">
                  <h3 className="text-lg font-semibold mb-2">Interview History</h3>
                  <pre className="whitespace-pre-wrap text-gray-800 overflow-auto max-h-96 text-sm">
                    {analysisResult}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
        
        {aiResponses.length > 0 && (
          <div className="border-t border-gray-200">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-3">Interview Transcript</h2>
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