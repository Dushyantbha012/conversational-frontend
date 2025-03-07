"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { TutorWebSocket } from "@/lib/tutor/10th/tutor-ws";

export default function NCERTTutor() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [responses, setResponses] = useState<string[]>([]);
  const [textQuestion, setTextQuestion] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);

  const tutorWsRef = useRef<TutorWebSocket | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);
  
  // Initialize tutor WebSocket instance
  useEffect(() => {
    tutorWsRef.current = new TutorWebSocket("ws://localhost:8766");
    
    // Set up event listeners
    tutorWsRef.current.addMessageListener((message) => {
      setResponses(prev => [...prev, message]);
    });
    
    tutorWsRef.current.addStatusChangeListener((status) => {
      setConnectionStatus(status);
      
      if (status === "connected" || status === "ready") {
        setIsConnected(true);
      } else if (status === "disconnected") {
        setIsConnected(false);
        setIsRecording(false);
      }
    });
    
    tutorWsRef.current.addErrorListener((error) => {
      setResponses(prev => [...prev, `Error: ${error}`]);
    });
    
    tutorWsRef.current.addExplanationListener((question, explanation) => {
      // Optional: Add specific handling for explanations beyond the general message listener
    });
    
    return () => {
      // Cleanup
      if (tutorWsRef.current) {
        tutorWsRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the bottom when new responses arrive
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [responses]);

  const connectToTutor = async () => {
    try {
      if (tutorWsRef.current) {
        await tutorWsRef.current.connect();
      }
    } catch (error) {
      console.error("Error connecting to tutor:", error);
    }
  };

  const startRecording = async () => {
    try {
      if (tutorWsRef.current) {
        await tutorWsRef.current.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const stopRecording = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.stopRecording();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const toggleMicrophone = () => {
    if (tutorWsRef.current && isRecording) {
      if (isMicMuted) {
        // Unmute - resume sending audio
        tutorWsRef.current.resumeAudio();
        setIsMicMuted(false);
      } else {
        // Mute - pause sending audio without stopping recording
        tutorWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const sendTextQuestion = () => {
    if (tutorWsRef.current && textQuestion.trim()) {
      tutorWsRef.current.sendTextQuestion(textQuestion);
      setTextQuestion("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextQuestion();
    }
  };

  const clearResponses = () => {
    setResponses([]);
  };

  const disconnect = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.disconnect();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-blue-600 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">NCERT 10th Grade Tutor</h1>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        <div className="p-6 space-y-4 bg-gray-50 rounded-md">
          {!isConnected ? (
            <button
              onClick={connectToTutor}
              className="px-4 py-2 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 w-full"
            >
              Connect to Tutor
            </button>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <button 
                  onClick={toggleRecording}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                  }`}
                >
                  {isRecording ? "Stop Voice Input" : "Start Voice Input"}
                </button>
                
                <button
                  onClick={toggleMicrophone}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                  }`}
                  disabled={!isRecording}
                >
                  {isMicMuted ? "Unmute Mic" : "Mute Mic"}
                </button>
                
                <button
                  onClick={clearResponses}
                  className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
                >
                  Clear Chat
                </button>
                
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded-md font-medium text-white bg-gray-700 hover:bg-gray-800"
                >
                  Disconnect
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-gray-600">
                  {isRecording 
                    ? isMicMuted 
                      ? "Microphone muted. Click 'Unmute Mic' to continue."
                      : "Voice input active. Ask your questions about NCERT topics." 
                    : "Click 'Start Voice Input' to ask questions by voice."}
                </p>
                <p className="text-sm text-gray-500 mt-1">Status: {connectionStatus}</p>
              </div>
              
              <div className="relative">
                <textarea
                  value={textQuestion}
                  onChange={(e) => setTextQuestion(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="w-full p-3 pr-16 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder="Type your question here... (Press Enter to send)"
                  rows={2}
                ></textarea>
                <button
                  onClick={sendTextQuestion}
                  className="absolute right-2 bottom-2 p-2 rounded-md bg-blue-500 text-white hover:bg-blue-600"
                  disabled={!textQuestion.trim()}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        {responses.length > 0 && (
          <section className="bg-white mt-6 p-4 border border-gray-200 rounded-md shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Tutor Chat</h2>
            <div className="bg-gray-50 rounded-md p-4 max-h-[60vh] overflow-y-auto">
              {responses.map((response, index) => (
                <div key={index} className="mb-4 pb-3 border-b border-gray-200 last:border-b-0">
                  {response.startsWith("You asked:") ? (
                    <div className="bg-blue-50 p-3 rounded-lg max-w-[80%] ml-auto">
                      <p className="whitespace-pre-wrap text-gray-800">{response.substring(10)}</p>
                    </div>
                  ) : response.startsWith("Error:") ? (
                    <div className="bg-red-50 p-3 rounded-lg">
                      <p className="whitespace-pre-wrap text-red-800">{response}</p>
                    </div>
                  ) : response.startsWith("Q:") ? (
                    <div className="space-y-2">
                      <div className="bg-blue-50 p-3 rounded-lg max-w-[80%] ml-auto">
                        <p className="font-medium text-gray-900">Question:</p>
                        <p className="whitespace-pre-wrap text-gray-800">{response.split("\n\nA:")[0].substring(3)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <p className="font-medium text-gray-900">Answer:</p>
                        <p className="whitespace-pre-wrap text-gray-800">{response.split("\n\nA:")[1]}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="whitespace-pre-wrap text-gray-800">{response}</p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={responseEndRef} />
            </div>
          </section>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © NextRound NCERT Tutor | Grade 10
      </footer>
    </div>
  );
}
