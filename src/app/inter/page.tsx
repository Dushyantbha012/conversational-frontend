"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { InterviewWebSocket, InterviewConfig, InterviewScore } from "@/lib/interview-ws";

export default function InterviewAssistant() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [aiResponses, setAiResponses] = useState<string[]>([]);
  const [resumeText, setResumeText] = useState<string>("");
  const [resumeUrl, setResumeUrl] = useState<string>("");
  const [numberOfQuestions, setNumberOfQuestions] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [interviewComplete, setInterviewComplete] = useState<boolean>(false);
  const [finalMessage, setFinalMessage] = useState<string>("");
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [scores, setScores] = useState<InterviewScore[]>([]);
  const [isAnalysisRequested, setIsAnalysisRequested] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);

  const interviewWsRef = useRef<InterviewWebSocket | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize interview WebSocket instance
  useEffect(() => {
    interviewWsRef.current = new InterviewWebSocket("ws://localhost:8765");
    
    // Set up event listeners
    interviewWsRef.current.addMessageListener((message) => {
      setAiResponses(prev => [...prev, message]);
    });
    
    interviewWsRef.current.addStatusChangeListener((status) => {
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
    
    interviewWsRef.current.addErrorListener((error) => {
      setAiResponses(prev => [...prev, `Error: ${error}`]);
    });
    
    interviewWsRef.current.addAnalysisListener((message, interviewScores) => {
      setFinalMessage(message);
      if (interviewScores) {
        setScores(interviewScores);
        const formattedHistory = formatHistory(interviewScores);
        setAnalysisResult(formattedHistory);
      }
    });
    
    return () => {
      // Cleanup
      if (interviewWsRef.current) {
        interviewWsRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the bottom when new responses arrive
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiResponses]);

  const formatHistory = (history: InterviewScore[]) => {
    return history.map((item, index) => {
      return `${index + 1}. ${item.role.toUpperCase()}: ${item.content}${item.score ? ` (Score: ${item.score})` : ''}`;
    }).join('\n\n');
  };

  const configureAndStartInterview = async () => {
    if (!resumeText.trim() && !resumeUrl.trim()) {
      alert("Please provide either resume text or a resume PDF URL to start the interview");
      return;
    }
    
    try {
      const config: InterviewConfig = {
        resume_text: resumeText,
        number_of_ques: numberOfQuestions,
        difficulty: difficulty as "easy" | "medium" | "hard"
      };
      
      // Add resume PDF URL if provided
      if (resumeUrl.trim()) {
        config.resume_pdf = resumeUrl;
      }
      
      if (interviewWsRef.current) {
        await interviewWsRef.current.configure(config);
        // Note: startRecording will be triggered by the "ready" status change
      }
    } catch (error) {
      console.error("Error configuring interview:", error);
    }
  };

  const startRecording = async () => {
    try {
      if (interviewWsRef.current) {
        await interviewWsRef.current.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const toggleRecording = () => {
    if (interviewWsRef.current) {
      if (isRecording) {
        interviewWsRef.current.stopRecording();
        setIsRecording(false);
      } else {
        startRecording();
      }
    }
  };

  const toggleMicrophone = () => {
    if (interviewWsRef.current && isRecording) {
      if (isMicMuted) {
        // Unmute - resume sending audio
        interviewWsRef.current.resumeAudio();
        setIsMicMuted(false);
      } else {
        // Mute - pause sending audio without stopping recording
        interviewWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const requestAnalysis = () => {
    if (interviewWsRef.current) {
      interviewWsRef.current.requestAnalysis();
      setIsAnalysisRequested(true);
    }
  };

  const clearResponses = () => {
    setAiResponses([]);
  };

  const toggleHistoryView = () => {
    setShowHistory(!showHistory);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-blue-600 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">Interview Assistant</h1>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
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
              className="px-4 py-2 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700 w-full"
            >
              Start Interview
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div className="flex justify-between mb-4">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
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
            
            <div className="mb-4">
              <p className="text-gray-600">
                {interviewComplete 
                  ? "Interview complete! Thank you for participating."
                  : isRecording 
                    ? isMicMuted 
                      ? "Microphone muted. Click 'Unmute Mic' to continue."
                      : "Recording in progress... Answer the questions and wait for follow-up questions." 
                    : "Click 'Resume Interview' to continue."}
              </p>
              <p className="text-sm text-gray-500 mt-1">Status: {connectionStatus}</p>
            </div>

            {interviewComplete && finalMessage && (
              <div className="mb-4 p-4 bg-green-50 border border-green-100 rounded-md text-center">
                <p className="text-green-800 font-medium">{finalMessage}</p>
              </div>
            )}
            
            {/* Display analysis result */}
            {scores.length > 0 && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-lg font-semibold">Interview Results</h3>
                  <button 
                    onClick={toggleHistoryView}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {showHistory ? 'Hide Details' : 'Show Details'}
                  </button>
                </div>
                
                {showHistory ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-md p-4">
                    <div className="mb-4">
                      <h4 className="text-md font-medium mb-2">Question-Answer Pairs:</h4>
                      {scores.map((item, index) => (
                        <div key={index} className="mb-3 pb-3 border-b border-blue-200 last:border-b-0">
                          <p className="font-medium text-gray-700">
                            {item.role === 'system' ? 'Interviewer' : 'You'}:
                          </p>
                          <p className="whitespace-pre-wrap text-gray-800 ml-2 mb-1">
                            {item.content}
                          </p>
                          {item.score !== undefined && (
                            <p className="text-sm text-blue-600 font-medium mt-1">
                              Score: {item.score}/10
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <h4 className="text-md font-medium mb-2">Analysis:</h4>
                      <pre className="whitespace-pre-wrap text-gray-800 overflow-auto max-h-96 text-sm">
                        {analysisResult}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="bg-blue-50 border border-blue-100 rounded-md p-4">
                    <p className="text-center text-gray-700 mb-2">
                      Average Score: {scores.reduce((sum, item) => sum + (item.score || 0), 0) / 
                        scores.filter(item => item.score !== undefined).length || 0}/10
                    </p>
                    <p className="text-center text-sm text-gray-600">
                      Click "Show Details" to view the full interview analysis
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {aiResponses.length > 0 && (
          <section className="bg-white mt-6 p-4 border border-gray-200 rounded-md shadow-sm">
            <h2 className="text-lg font-semibold mb-2">Interview Transcript</h2>
            <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto">
              {aiResponses.map((response, index) => (
                <div key={index} className="mb-3 pb-3 border-b border-gray-200 last:border-b-0">
                  <p className="whitespace-pre-wrap text-gray-800">{response}</p>
                </div>
              ))}
              <div ref={responseEndRef} />
            </div>
          </section>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound
      </footer>
    </div>
  );
}