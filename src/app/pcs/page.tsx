"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { PCSWebSocket, BilingualResponse } from "@/lib/pcs-ws";

export default function PCSInterviewAssistant() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [responses, setResponses] = useState<BilingualResponse[]>([]);
  const [candidateInfo, setCandidateInfo] = useState<string>("");
  const [interviewComplete, setInterviewComplete] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [preferredLanguage, setPreferredLanguage] = useState<string>("english"); // or "hindi"

  const pcsWsRef = useRef<PCSWebSocket | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize PCS WebSocket instance
  useEffect(() => {
    pcsWsRef.current = new PCSWebSocket("ws://localhost:8767");
    
    // Set up event listeners
    pcsWsRef.current.addMessageListener((message) => {
      setResponses(prev => [...prev, message]);
    });
    
    pcsWsRef.current.addStatusChangeListener((status) => {
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
    
    pcsWsRef.current.addErrorListener((error) => {
      // Display errors as responses
      const errorResponse: BilingualResponse = {
        english: `Error: ${error}`,
        hindi: `त्रुटि: ${error}`
      };
      setResponses(prev => [...prev, errorResponse]);
    });
    
    return () => {
      // Cleanup
      if (pcsWsRef.current) {
        pcsWsRef.current.disconnect();
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
    if (!candidateInfo.trim()) {
      alert("Please provide candidate information to start the interview");
      return;
    }
    
    try {
      if (pcsWsRef.current) {
        await pcsWsRef.current.configure({
          candidate_info: candidateInfo
        });
        // Note: startRecording will be triggered by the "ready" status change
      }
    } catch (error) {
      console.error("Error configuring interview:", error);
    }
  };

  const startRecording = async () => {
    try {
      if (pcsWsRef.current) {
        await pcsWsRef.current.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const toggleRecording = () => {
    if (pcsWsRef.current) {
      if (isRecording) {
        pcsWsRef.current.stopRecording();
        setIsRecording(false);
      } else {
        startRecording();
      }
    }
  };

  const toggleMicrophone = () => {
    if (pcsWsRef.current && isRecording) {
      if (isMicMuted) {
        // Unmute - resume sending audio
        pcsWsRef.current.resumeAudio();
        setIsMicMuted(false);
      } else {
        // Mute - pause sending audio without stopping recording
        pcsWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const endInterview = () => {
    if (pcsWsRef.current) {
      pcsWsRef.current.endInterview();
    }
  };

  const clearResponses = () => {
    setResponses([]);
  };

  const toggleLanguage = () => {
    setPreferredLanguage(prev => prev === "english" ? "hindi" : "english");
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-blue-700 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">PCS Interview Assistant</h1>
        <p className="text-sm opacity-80">Punjab Civil Services Interview Preparation</p>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div>
              <label htmlFor="candidate-info" className="block text-sm font-medium text-gray-700 mb-1">
                Candidate Information:
              </label>
              <textarea 
                id="candidate-info"
                value={candidateInfo}
                onChange={(e) => setCandidateInfo(e.target.value)}
                className="w-full h-40 p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your background information here (education, career, district, etc.)"
              ></textarea>
              <p className="mt-1 text-sm text-gray-500">
                Provide details about yourself to help tailor the PCS interview questions to your profile.
              </p>
            </div>
            
            <button
              onClick={configureAndStartInterview}
              className="px-4 py-2 rounded-md font-medium text-white bg-blue-700 hover:bg-blue-800 w-full"
            >
              Start PCS Interview
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div className="flex justify-between mb-4 flex-wrap gap-2">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
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
                onClick={toggleLanguage}
                className="px-4 py-2 rounded-md font-medium text-white bg-purple-500 hover:bg-purple-600"
              >
                {preferredLanguage === "english" ? "Switch to Hindi" : "Switch to English"}
              </button>
              
              <button
                onClick={endInterview}
                className="px-4 py-2 rounded-md font-medium text-white bg-blue-500 hover:bg-blue-600"
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
                  ? "Interview complete! Thank you for participating."
                  : isRecording 
                    ? isMicMuted 
                      ? "Microphone muted. Click 'Unmute Mic' to continue."
                      : "Recording in progress... Answer the questions from the panel." 
                    : "Click 'Resume Interview' to continue."}
              </p>
              <p className="text-sm text-gray-500 mt-1">Status: {connectionStatus}</p>
            </div>
          </div>
        )}

        {responses.length > 0 && (
          <section className="bg-white mt-6 p-4 border border-gray-200 rounded-md shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Interview Transcript</h2>
            <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto">
              {responses.map((response, index) => (
                <div key={index} className="mb-3 pb-3 border-b border-gray-200 last:border-b-0">
                  {/* Display preferred language first */}
                  {response[preferredLanguage as keyof BilingualResponse] && (
                    <p className="whitespace-pre-wrap text-gray-800 font-medium">
                      {response[preferredLanguage as keyof BilingualResponse]}
                    </p>
                  )}
                  
                  {/* Display the other language in smaller text */}
                  {preferredLanguage === "english" && response.hindi && (
                    <p className="whitespace-pre-wrap text-gray-500 text-sm mt-1">
                      Hindi: {response.hindi}
                    </p>
                  )}
                  {preferredLanguage === "hindi" && response.english && (
                    <p className="whitespace-pre-wrap text-gray-500 text-sm mt-1">
                      English: {response.english}
                    </p>
                  )}
                </div>
              ))}
              <div ref={responseEndRef} />
            </div>
          </section>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound | PCS Interview Preparation Module
      </footer>
    </div>
  );
}
