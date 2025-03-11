"use client";
// Import the Modal component
import Modal from '@/components/history-modal';
import { useEffect, useRef, useState } from "react";
import React from "react";
import { InterviewWebSocket, InterviewConfig, InterviewScore } from "@/lib/interview-ws";

export default function InterviewAssistant() {
  // Add state for modal
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState<boolean>(false);
  
  // Rest of your existing state variables...
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
  
  // New state variables for language support
  const [language, setLanguage] = useState<string>("english");
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [showLanguagePrompt, setShowLanguagePrompt] = useState<boolean>(false);

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
        setIsAnalysisRequested(false); // Reset analysis request state
        // Don't reset isConfigured here to keep showing the interview UI
      } else if (status === "disconnected") {
        // Only reset configuration if interview is not complete
        if (!interviewComplete) {
          setIsConfigured(false);
        }
        setIsRecording(false);
      }
    });
    
    interviewWsRef.current.addErrorListener((error) => {
      setAiResponses(prev => [...prev, `Error: ${error}`]);
    });
    
    interviewWsRef.current.addAnalysisListener((message, interviewScores) => {
      console.log("Analysis received:", message);
      console.log("Raw scores:", interviewScores);
      setFinalMessage(message);
      
      if (interviewScores && interviewScores.length > 0) {
        // Filter out any items with missing content - safeguard against empty data
        const validScores = interviewScores.filter(item => 
          item && item.role && (item.content || item.content === "")
        );
        
        console.log("Filtered scores:", validScores);
        
        // Only set scores if we have valid data
        if (validScores.length > 0) {
          setScores(validScores);
          const formattedHistory = formatHistory(validScores);
          setAnalysisResult(formattedHistory);
        } else {
          console.warn("Received empty or invalid scores data");
        }
        
        // Always open the history modal when analysis is complete
        setIsHistoryModalOpen(true);
      }
    });
    
    // Add language prompt listener
    interviewWsRef.current.addLanguagePromptListener((options) => {
      console.log("Language options received:", options);
      setLanguageOptions(options);
      setShowLanguagePrompt(true);
    });
    
    return () => {
      // Cleanup
      if (interviewWsRef.current) {
        interviewWsRef.current.disconnect();
      }
    };
  }, [interviewComplete]); // Add interviewComplete to the dependency array

  useEffect(() => {
    // Auto-scroll to the bottom when new responses arrive
    if (responseEndRef.current) {
      responseEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [aiResponses]);

  // Update the selected language when the interview WebSocket instance updates it
  useEffect(() => {
    if (interviewWsRef.current) {
      const currentLanguage = interviewWsRef.current.getSelectedLanguage();
      if (currentLanguage) {
        setLanguage(currentLanguage);
      }
    }
  }, [connectionStatus]); // Check whenever connection status changes

  const formatHistory = (history: InterviewScore[]) => {
    if (!history || history.length === 0) return "No interview data available";
    
    return history
      // Only filter out if content is undefined, not if it's an empty string
      .filter(item => item.content !== undefined)
      .map((item, index) => {
        const role = item.role === 'system' ? 'Interviewer' : 'You';
        const scoreInfo = item.score !== undefined ? ` (Score: ${item.score}/10)` : '';
        
        return `${index + 1}. ${role}: ${item.content || "[No content]"}${scoreInfo}`;
      })
      .join('\n\n');
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
        difficulty: difficulty as "easy" | "medium" | "hard",
        language: language as "english" | "hindi" // Add language to config
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
      setAiResponses(prev => [...prev, "Requesting analysis of the interview..."]);
    }
  };

  const clearResponses = () => {
    setAiResponses([]);
  };

  const openHistoryModal = () => {
    setIsHistoryModalOpen(true);
  };

  // Add a reset function to start a new interview
  const resetInterview = () => {
    // Disconnect existing connection
    if (interviewWsRef.current) {
      interviewWsRef.current.disconnect();
    }
    
    // Reset all states
    setIsConfigured(false);
    setIsRecording(false);
    setAiResponses([]);
    setInterviewComplete(false);
    setFinalMessage("");
    setAnalysisResult("");
    setScores([]);
    setIsAnalysisRequested(false);
    setConnectionStatus("disconnected");
    setIsMicMuted(false);
    setShowLanguagePrompt(false);
  };
  
  // Handle language selection
  const handleLanguageSelect = (selectedLanguage: string) => {
    if (interviewWsRef.current) {
      interviewWsRef.current.selectLanguage(selectedLanguage);
      setLanguage(selectedLanguage);
      setShowLanguagePrompt(false);
      
      // Add a message about language selection
      const message = selectedLanguage === "hindi" 
        ? "हिंदी भाषा चुनी गई। इंटरव्यू हिंदी में जारी रहेगा।" 
        : "English language selected. The interview will continue in English.";
      
      setAiResponses(prev => [...prev, message]);
    }
  };

  // Get status message based on current state and language
  const getStatusMessage = () => {
    if (interviewComplete) {
      return language === "hindi" 
        ? "इंटरव्यू पूरा हुआ! भाग लेने के लिए धन्यवाद।" 
        : "Interview complete! Thank you for participating.";
    }
    
    if (isRecording) {
      if (isMicMuted) {
        return language === "hindi"
          ? "माइक्रोफोन म्यूट है। जारी रखने के लिए 'माइक अनम्यूट करें' पर क्लिक करें।"
          : "Microphone muted. Click 'Unmute Mic' to continue.";
      }
      return language === "hindi"
        ? "रिकॉर्डिंग चल रही है... प्रश्नों का उत्तर दें और अगले सवालों के लिए प्रतीक्षा करें।"
        : "Recording in progress... Answer the questions and wait for follow-up questions.";
    }
    
    return language === "hindi"
      ? "इंटरव्यू जारी रखने के लिए 'रिकॉर्डिंग फिर शुरू करें' पर क्लिक करें।"
      : "Click 'Resume Interview' to continue.";
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-blue-600 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Interview Assistant</h1>
        
        {/* Language indicator */}
        {isConfigured && (
          <div className="flex items-center">
            <span className="text-sm mr-2">
              {language === "hindi" ? "भाषा:" : "Language:"}
            </span>
            <span className="px-2 py-1 bg-blue-700 rounded-md text-sm font-medium">
              {language === "hindi" ? "हिंदी" : "English"}
            </span>
          </div>
        )}
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {/* Language Selection Prompt */}
        {showLanguagePrompt && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-100 rounded-md">
            <h3 className="font-medium text-lg mb-2">Choose Interview Language:</h3>
            <div className="flex space-x-4">
              {languageOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleLanguageSelect(option.toLowerCase())}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
        
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              
              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                  Interview Language:
                </label>
                <select
                  id="language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                >
                  <option value="english">English</option>
                  <option value="hindi">Hindi</option>
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
            <div className="flex flex-wrap gap-2 justify-between mb-4">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                }`}
                disabled={interviewComplete}
              >
                {isRecording 
                  ? (language === "hindi" ? "इंटरव्यू रोकें" : "Pause Interview") 
                  : (language === "hindi" ? "इंटरव्यू फिर शुरू करें" : "Resume Interview")}
              </button>
              
              <button
                onClick={toggleMicrophone}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                }`}
                disabled={!isRecording || interviewComplete}
              >
                {isMicMuted 
                  ? (language === "hindi" ? "माइक अनम्यूट करें" : "Unmute Mic") 
                  : (language === "hindi" ? "माइक म्यूट करें" : "Mute Mic")}
              </button>
              
              <button
                onClick={requestAnalysis}
                className="px-4 py-2 rounded-md font-medium text-white bg-green-500 hover:bg-green-600"
                disabled={interviewComplete || isAnalysisRequested}
              >
                {isAnalysisRequested 
                  ? (language === "hindi" ? "विश्लेषण अनुरोधित..." : "Analysis Requested...") 
                  : (language === "hindi" ? "समाप्त करें और विश्लेषण प्राप्त करें" : "End & Get Analysis")}
              </button>
              
              <button
                onClick={clearResponses}
                className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
              >
                {language === "hindi" ? "प्रतिक्रियाएं साफ़ करें" : "Clear Responses"}
              </button>

              {interviewComplete && (
                <button
                  onClick={resetInterview}
                  className="px-4 py-2 rounded-md font-medium text-white bg-blue-500 hover:bg-blue-600"
                >
                  {language === "hindi" ? "नया इंटरव्यू शुरू करें" : "Start New Interview"}
                </button>
              )}
            </div>
            
            <div className="mb-4">
              <p className="text-gray-600">{getStatusMessage()}</p>
              <p className="text-sm text-gray-500 mt-1">
                {language === "hindi" ? "स्थिति:" : "Status:"} {connectionStatus}
              </p>
            </div>

            {interviewComplete && finalMessage && (
              <div className="mb-4 p-4 bg-green-50 border border-green-100 rounded-md text-center">
                <p className="text-green-800 font-medium">{finalMessage}</p>
              </div>
            )}
            
            {/* Display analysis result */}
            {scores.length > 0 && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-md">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {language === "hindi" ? "इंटरव्यू परिणाम" : "Interview Results"}
                    </h3>
                    <p className="text-gray-700">
                      {language === "hindi" ? "औसत स्कोर:" : "Average Score:"} {
                        scores.filter(item => item.score !== undefined).length > 0 ?
                        (scores.reduce((sum, item) => sum + (item.score || 0), 0) / 
                        scores.filter(item => item.score !== undefined).length).toFixed(1) :
                        "N/A"
                      }/10
                    </p>
                  </div>
                  <button 
                    onClick={openHistoryModal}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    {language === "hindi" ? "इंटरव्यू इतिहास देखें" : "View Interview History"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {aiResponses.length > 0 && (
          <section className="bg-white mt-6 p-4 border border-gray-200 rounded-md shadow-sm">
            <h2 className="text-lg font-semibold mb-2">
              {language === "hindi" ? "इंटरव्यू ट्रांसक्रिप्ट" : "Interview Transcript"}
            </h2>
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
      
      {/* Add the Interview History Modal */}
      <Modal 
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        title={language === "hindi" ? "इंटरव्यू इतिहास" : "Interview History"}
      >
        <div>
          {/* Analysis Text Overview */}
          {finalMessage && (
            <div className="mb-6 p-4 bg-blue-50 rounded-md">
              <h4 className="text-md font-medium mb-2">
                {language === "hindi" ? "विश्लेषण सारांश:" : "Analysis Summary:"}
              </h4>
              <p className="text-gray-700 whitespace-pre-wrap">{finalMessage}</p>
            </div>
          )}
          
          {/* Question-Answer History - Modified to be more permissive */}
          <div>
            <h4 className="text-md font-medium mb-3">
              {language === "hindi" ? "प्रश्न-उत्तर जोड़े:" : "Question-Answer Pairs:"}
            </h4>
            {scores && scores.length > 0 ? (
              <div className="space-y-4">
                {scores.map((item, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-md">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-gray-800">
                        {item.role === 'system' 
                          ? (language === "hindi" ? 'इंटरव्यूअर' : 'Interviewer') 
                          : (language === "hindi" ? 'आप' : 'You')}:
                      </p>
                      {item.score !== undefined && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
                          {language === "hindi" ? "स्कोर:" : "Score:"} {item.score}/10
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-gray-700">
                      {item.content || (language === "hindi" ? "कोई सामग्री उपलब्ध नहीं" : "No content available")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic">
                {language === "hindi" ? "कोई इंटरव्यू इतिहास उपलब्ध नहीं है" : "No interview history available"}
              </p>
            )}
          </div>
        </div>
      </Modal>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound
      </footer>
    </div>
  );
}