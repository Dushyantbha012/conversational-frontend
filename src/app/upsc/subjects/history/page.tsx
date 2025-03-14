"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { HistoryWebSocket, HistoryConfig } from "@/lib/upsc/subject/history-ws";

export default function HistoryInterview() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [responses, setResponses] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [interviewComplete, setInterviewComplete] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("english");
  const [showLanguagePrompt, setShowLanguagePrompt] = useState<boolean>(false);
  const [languageOptions, setLanguageOptions] = useState<string[]>(["English", "Hindi"]);

  const historyWsRef = useRef<HistoryWebSocket | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize History WebSocket instance
  useEffect(() => {
    historyWsRef.current = new HistoryWebSocket("ws://localhost:8764");
    
    // Set up event listeners
    historyWsRef.current.addMessageListener((message) => {
      setResponses(prev => [...prev, message]);
    });
    
    historyWsRef.current.addStatusChangeListener((status) => {
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
    
    historyWsRef.current.addErrorListener((error) => {
      setResponses(prev => [...prev, `Error: ${error}`]);
    });
    
    // Add language prompt listener
    historyWsRef.current.addLanguagePromptListener((options) => {
      setLanguageOptions(options);
      setShowLanguagePrompt(true);
    });
    
    return () => {
      // Cleanup
      if (historyWsRef.current) {
        historyWsRef.current.disconnect();
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
      const config: HistoryConfig = {
        difficulty: difficulty as "easy" | "medium" | "hard",
        language: language as "english" | "hindi"
      };
      
      if (historyWsRef.current) {
        await historyWsRef.current.configure(config);
        // Note: startRecording will be triggered by the "ready" status change
      }
    } catch (error) {
      console.error("Error configuring History interview:", error);
    }
  };

  const selectLanguage = (selectedLanguage: string) => {
    const normalizedLanguage = selectedLanguage.toLowerCase();
    setLanguage(normalizedLanguage);
    setShowLanguagePrompt(false);
    
    if (historyWsRef.current) {
      historyWsRef.current.selectLanguage(normalizedLanguage);
    }
  };

  const startRecording = async () => {
    try {
      if (historyWsRef.current) {
        await historyWsRef.current.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const toggleRecording = () => {
    if (historyWsRef.current) {
      if (isRecording) {
        historyWsRef.current.stopRecording();
        setIsRecording(false);
      } else {
        startRecording();
      }
    }
  };

  const toggleMicrophone = () => {
    if (historyWsRef.current && isRecording) {
      if (isMicMuted) {
        // Unmute - resume sending audio
        historyWsRef.current.resumeAudio();
        setIsMicMuted(false);
      } else {
        // Mute - pause sending audio without stopping recording
        historyWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const endInterview = () => {
    if (historyWsRef.current) {
      historyWsRef.current.endInterview();
      setInterviewComplete(true);
    }
  };

  const clearResponses = () => {
    setResponses([]);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-amber-700 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">History Interview Assistant</h1>
        <p className="text-sm opacity-90">History Practice Interview for UPSC</p>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {showLanguagePrompt && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10">
            <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
              <h2 className="text-xl font-semibold text-amber-700 mb-4">Select Interview Language</h2>
              <p className="mb-4">Would you like to conduct this interview in English or Hindi?</p>
              <div className="flex space-x-4">
                {languageOptions.map((option) => (
                  <button
                    key={option}
                    className="flex-1 px-4 py-2 bg-amber-600 text-white rounded hover:bg-amber-700 transition"
                    onClick={() => selectLanguage(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md shadow-sm">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-amber-700">Welcome to History Interview Practice</h2>
              <p className="mt-2 text-gray-600">
                This interview will help you prepare for History topics in UPSC exams
                with interactive questions and real-time feedback.
              </p>
            </div>
            
            <div className="bg-amber-50 p-4 rounded-md">
              <h3 className="font-medium text-amber-700 mb-2">What to expect:</h3>
              <ul className="list-disc ml-5 text-gray-700 space-y-1">
                <li>Questions on ancient to modern world history</li>
                <li>Discussion on key historical events and figures</li>
                <li>Indian history and international historical developments</li>
                <li>Real-time feedback on your historical knowledge</li>
              </ul>
            </div>
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
                  Difficulty Level:
                </label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  Preferred Language:
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-amber-500 focus:border-amber-500"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
                </select>
              </div>
            </div>
            
            <button
              onClick={configureAndStartInterview}
              className="px-4 py-2 rounded-md font-medium text-white bg-amber-700 hover:bg-amber-800 w-full mt-4"
            >
              Start History Interview
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md shadow-sm">
            <div className="flex justify-between mb-4">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-amber-600 hover:bg-amber-700"
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
            
            <div className="mb-4 flex justify-between items-center">
              <p className="text-gray-600">
                {interviewComplete 
                  ? "Interview complete! Thank you for participating in this History practice session."
                  : isRecording 
                    ? isMicMuted 
                      ? "Microphone muted. Click 'Unmute Mic' to continue."
                      : "History interview in progress... Answer the questions clearly." 
                    : "Click 'Resume Interview' to continue the History interview."}
              </p>
              <div className="text-right">
                <span className="text-sm text-gray-500 block">Status: {connectionStatus}</span>
                <span className="text-sm text-gray-500 block">Language: {language === "hindi" ? "हिंदी" : "English"}</span>
              </div>
            </div>
          </div>
        )}

        {responses.length > 0 && (
          <section className="bg-white mt-6 p-4 border border-gray-200 rounded-md shadow-sm">
            <h2 className="text-lg font-semibold mb-2 text-amber-700">History Interview Transcript</h2>
            <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto">
              {responses.map((response, index) => (
                <div 
                  key={index} 
                  className={`mb-3 pb-3 ${
                    index % 2 === 0 
                      ? "bg-amber-50 p-3 rounded-md" 
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

        <div className="mt-6 bg-amber-50 p-4 rounded-md text-sm text-amber-700">
          <h3 className="font-medium mb-1">History Interview Tips:</h3>
          <ul className="list-disc ml-5 space-y-1">
            <li>Provide chronological context for historical events</li>
            <li>Discuss causes and consequences of key developments</li>
            <li>Connect historical events to broader patterns and themes</li>
            <li>Consider multiple historical perspectives and interpretations</li>
          </ul>
        </div>
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound | UPSC History Practice Interview
      </footer>
    </div>
  );
}
