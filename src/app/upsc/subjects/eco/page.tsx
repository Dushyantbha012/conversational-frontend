"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { EcoWebSocket, EcoConfig } from "@/lib/upsc/subject/eco-ws";

export default function EconomicsInterview() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [responses, setResponses] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [interviewComplete, setInterviewComplete] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);

  const ecoWsRef = useRef<EcoWebSocket | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize Economics WebSocket instance
  useEffect(() => {
    ecoWsRef.current = new EcoWebSocket("ws://localhost:8768");
    
    // Set up event listeners
    ecoWsRef.current.addMessageListener((message) => {
      setResponses(prev => [...prev, message]);
    });
    
    ecoWsRef.current.addStatusChangeListener((status) => {
      setConnectionStatus(status);
      
      if (status === "ready") {
        setIsConfigured(true);
        // Auto-start recording when ready
        startRecording();
      } else if (status === "complete") {
        setInterviewComplete(true);
        setIsRecording(false);
      } else if (status === "disconnected") {
        setIsConfigured(false);
        setIsRecording(false);
      }
    });
    
    ecoWsRef.current.addErrorListener((error) => {
      setResponses(prev => [...prev, `Error: ${error}`]);
    });
    
    return () => {
      // Cleanup
      if (ecoWsRef.current) {
        ecoWsRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the bottom when new responses arrive
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [responses]);

  const configureAndStartInterview = async () => {
    try {
      const config: EcoConfig = {
        difficulty: difficulty as "easy" | "medium" | "hard"
      };
      
      if (ecoWsRef.current) {
        await ecoWsRef.current.configure(config);
        // Note: startRecording will be triggered by the "ready" status change
      }
    } catch (error) {
      console.error("Error configuring Economics interview:", error);
    }
  };

  const startRecording = async () => {
    try {
      if (ecoWsRef.current) {
        await ecoWsRef.current.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const toggleRecording = () => {
    if (ecoWsRef.current) {
      if (isRecording) {
        ecoWsRef.current.stopRecording();
        setIsRecording(false);
      } else {
        startRecording();
      }
    }
  };

  const toggleMicrophone = () => {
    if (ecoWsRef.current && isRecording) {
      if (isMicMuted) {
        // Unmute - resume sending audio
        ecoWsRef.current.resumeAudio();
        setIsMicMuted(false);
      } else {
        // Mute - pause sending audio without stopping recording
        ecoWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const endInterview = () => {
    if (ecoWsRef.current) {
      ecoWsRef.current.endInterview();
      setInterviewComplete(true);
    }
  };

  const clearResponses = () => {
    setResponses([]);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-green-600 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">Economics Interview Assistant</h1>
        <p className="text-sm opacity-90">Economics Practice Interview for UPSC</p>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-green-700">Welcome to Economics Interview Practice</h2>
              <p className="mt-2 text-gray-600">
                This interview will help you prepare for Economics topics in UPSC exams
                with interactive questions and real-time feedback.
              </p>
            </div>
            
            <div className="bg-green-50 p-4 rounded-md">
              <h3 className="font-medium text-green-700 mb-2">What to expect:</h3>
              <ul className="list-disc ml-5 text-gray-700 space-y-1">
                <li>Questions on micro and macroeconomics</li>
                <li>Discussion on economic policies and theories</li>
                <li>Indian economy and international economics topics</li>
                <li>Real-time feedback on your answers</li>
              </ul>
            </div>
            
            <div>
              <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
                Difficulty Level:
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            
            <button
              onClick={configureAndStartInterview}
              className="px-4 py-2 rounded-md font-medium text-white bg-green-600 hover:bg-green-700 w-full"
            >
              Start Economics Interview
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md shadow-sm">
            <div className="flex justify-between mb-4">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                }`}
                disabled={interviewComplete}
              >
                {isRecording ? "Pause Interview" : "Resume Interview"}
              </button>
              
              <button
                onClick={toggleMicrophone}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                }`}
                disabled={!isRecording || interviewComplete}
              >
                {isMicMuted ? "Unmute Mic" : "Mute Mic"}
              </button>
              
              <button
                onClick={endInterview}
                className="px-4 py-2 rounded-md font-medium text-white bg-green-500 hover:bg-green-600"
                disabled={interviewComplete}
              >
                End Interview
              </button>
              
              <button
                onClick={clearResponses}
                className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
              >
                Clear Responses
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-600">
                {interviewComplete 
                  ? "Interview complete! Thank you for participating in this Economics practice session."
                  : isRecording 
                    ? isMicMuted 
                      ? "Microphone muted. Click 'Unmute Mic' to continue."
                      : "Economics interview in progress... Answer the questions clearly." 
                    : "Click 'Resume Interview' to continue the Economics interview."}
              </p>
              <p className="text-sm text-gray-500 mt-1">Status: {connectionStatus}</p>
            </div>
          </div>
        )}

        {responses.length > 0 && (
          <section className="bg-white mt-6 p-4 border border-gray-200 rounded-md shadow-sm">
            <h2 className="text-lg font-semibold mb-2 text-green-700">Economics Interview Transcript</h2>
            <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto">
              {responses.map((response, index) => (
                <div 
                  key={index} 
                  className={`mb-3 pb-3 ${
                    index % 2 === 0 
                      ? "bg-green-50 p-3 rounded-md" 
                      : "border-b border-gray-100 last:border-b-0"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-gray-800">
                    {index % 2 === 0 ? "Interviewer: " : "You: "}
                    {response}
                  </p>
                </div>
              ))}
              <div ref={responseEndRef} />
            </div>
          </section>
        )}

        <div className="mt-6 bg-green-50 p-4 rounded-md text-sm text-green-700">
          <h3 className="font-medium mb-1">Economics Interview Tips:</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Explain economic concepts clearly with examples</li>
            <li>Relate theories to real-world economic scenarios</li>
            <li>Discuss both Indian and global economic perspectives</li>
            <li>Analyze policies in terms of their impacts and outcomes</li>
          </ul>
        </div>
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound | UPSC Economics Practice Interview
      </footer>
    </div>
  );
}
