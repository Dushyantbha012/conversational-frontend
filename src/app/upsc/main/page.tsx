"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { UPSCInterviewWebSocket, UPSCInterviewConfig, UPSCInterviewResponse, UPSCInterviewSummary } from "@/lib/upsc/upsc-prac-ws";

// Define interface for board member objects
interface BoardMember {
  name: string;
  background: string;
  expertise: string;
  style: string;
  sample_questions: string[];
}

export default function UPSCInterviewSimulator() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [questions, setQuestions] = useState<UPSCInterviewResponse[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<UPSCInterviewResponse | null>(null);
  const [userInfo, setUserInfo] = useState<UPSCInterviewConfig["user_info"]>({
    name: "",
    education: "",
    hobbies: "",
    achievements: "",
    background: "",
    optional_info: ""
  });
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [interviewComplete, setInterviewComplete] = useState<boolean>(false);
  const [summary, setSummary] = useState<UPSCInterviewSummary | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [textAnswer, setTextAnswer] = useState<string>("");
  const [isUsingText, setIsUsingText] = useState<boolean>(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  
  // New state variables for language support
  const [language, setLanguage] = useState<string>("english");
  const [languageOptions, setLanguageOptions] = useState<string[]>([]);
  const [showLanguagePrompt, setShowLanguagePrompt] = useState<boolean>(false);

  const interviewWsRef = useRef<UPSCInterviewWebSocket | null>(null);
  const questionEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize UPSC interview WebSocket instance
  useEffect(() => {
    interviewWsRef.current = new UPSCInterviewWebSocket("ws://localhost:8766");
    
    // Set up event listeners
    interviewWsRef.current.addQuestionListener((question) => {
      setQuestions(prev => [...prev, question]);
      setCurrentQuestion(question);
      
      if (question.is_final) {
        setInterviewComplete(true);
        setIsRecording(false);
      }
    });
    
    interviewWsRef.current.addStatusChangeListener((status) => {
      setConnectionStatus(status);
      
      if (status === "ready") {
        setIsConfigured(true);
      } else if (status === "complete") {
        setInterviewComplete(true);
        setIsRecording(false);
      } else if (status === "disconnected") {
        setIsConfigured(false);
        setIsRecording(false);
      }
    });
    
    interviewWsRef.current.addErrorListener((error) => {
      console.error("UPSC Interview Error:", error);
    });
    
    interviewWsRef.current.addSummaryListener((summaryData) => {
      // Debug the incoming summary data
      console.log("Received summary data:", summaryData);
      setSummary(summaryData);
      setIsSummaryLoading(false);
    });
    
    interviewWsRef.current.addSetupInfoListener((setupInfo) => {
      if (setupInfo.board_members) {
        setBoardMembers(setupInfo.board_members);
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
  }, []);

  // Update the selected language when the interview WebSocket instance updates it
  useEffect(() => {
    if (interviewWsRef.current) {
      const currentLanguage = interviewWsRef.current.getSelectedLanguage();
      if (currentLanguage) {
        setLanguage(currentLanguage);
      }
    }
  }, [connectionStatus]); // Check whenever connection status changes

  // Auto-scroll to the bottom when new questions arrive
  useEffect(() => {
    if (questionEndRef.current) {
      questionEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [questions]);

  const configureAndStartInterview = async () => {
    // Validate user info
    if (!userInfo.name.trim() || !userInfo.education.trim()) {
      alert("Please provide at least your name and education to start the UPSC interview");
      return;
    }
    
    try {
      const config: UPSCInterviewConfig = {
        user_info: userInfo,
        num_questions: numQuestions,
        language: language as "english" | "hindi" // Add language to config
      };
      
      if (interviewWsRef.current) {
        await interviewWsRef.current.configure(config);
        startRecording();
      }
    } catch (error) {
      console.error("Error configuring UPSC interview:", error);
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
        // Mute - pause sending audio
        interviewWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const toggleInputMethod = () => {
    setIsUsingText(!isUsingText);
  };

  const submitTextAnswer = () => {
    if (interviewWsRef.current && textAnswer.trim()) {
      interviewWsRef.current.submitTextAnswer(textAnswer);
      setTextAnswer("");
    }
  };

  const requestSummary = () => {
    if (interviewWsRef.current) {
      setIsSummaryLoading(true);
      setSummaryError(null);
      
      // Set a timeout to detect if summary doesn't arrive in a reasonable time
      const timeoutId = setTimeout(() => {
        if (isSummaryLoading) {
          setSummaryError("Summary request timed out. Please try again.");
          setIsSummaryLoading(false);
        }
      }, 10000); // 10 seconds timeout
      
      interviewWsRef.current.requestSummary();
      
      // Return a cleanup function to clear the timeout if component unmounts
      return () => clearTimeout(timeoutId);
    }
  };

  const endInterview = () => {
    if (interviewWsRef.current) {
      interviewWsRef.current.endInterview();
    }
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
      
      // You could potentially add this as a system message to questions if desired
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
        : "Recording in progress... Answer the questions from the UPSC board members.";
    }
    
    return language === "hindi"
      ? "इंटरव्यू जारी रखने के लिए 'इंटरव्यू फिर शुरू करें' पर क्लिक करें।"
      : "Click 'Resume Interview' to continue.";
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-green-700 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">UPSC Interview Simulator</h1>
        
        {/* Language indicator */}
        {isConfigured && (
          <div className="flex items-center">
            <span className="text-sm mr-2">
              {language === "hindi" ? "भाषा:" : "Language:"}
            </span>
            <span className="px-2 py-1 bg-green-800 rounded-md text-sm font-medium">
              {language === "hindi" ? "हिंदी" : "English"}
            </span>
          </div>
        )}
      </header>

      <main className="flex-1 p-6 mx-auto max-w-4xl">
        {/* Language Selection Prompt */}
        {showLanguagePrompt && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-100 rounded-md">
            <h3 className="font-medium text-lg mb-2">Choose Interview Language:</h3>
            <div className="flex space-x-4">
              {languageOptions.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleLanguageSelect(option.toLowerCase())}
                  className="px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        )}
        
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <h2 className="text-xl font-semibold mb-4">Candidate Information</h2>
            
            {/* Add language selection dropdown to configuration */}
            <div className="mb-4">
              <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-1">
                Interview Language:
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
              >
                <option value="english">English</option>
                <option value="hindi">Hindi</option>
              </select>
            </div>
            
            {/* Existing form fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name*:
                </label>
                <input
                  type="text"
                  id="name"
                  value={userInfo.name}
                  onChange={(e) => setUserInfo({...userInfo, name: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                  placeholder="Your full name"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="education" className="block text-sm font-medium text-gray-700 mb-1">
                  Educational Background*:
                </label>
                <input
                  type="text"
                  id="education"
                  value={userInfo.education}
                  onChange={(e) => setUserInfo({...userInfo, education: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                  placeholder="Your highest degree and institution"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="hobbies" className="block text-sm font-medium text-gray-700 mb-1">
                  Hobbies & Interests:
                </label>
                <input
                  type="text"
                  id="hobbies"
                  value={userInfo.hobbies}
                  onChange={(e) => setUserInfo({...userInfo, hobbies: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                  placeholder="Your hobbies and interests"
                />
              </div>
              
              <div>
                <label htmlFor="achievements" className="block text-sm font-medium text-gray-700 mb-1">
                  Achievements:
                </label>
                <input
                  type="text"
                  id="achievements"
                  value={userInfo.achievements}
                  onChange={(e) => setUserInfo({...userInfo, achievements: e.target.value})}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                  placeholder="Notable achievements"
                />
              </div>
            </div>
            
            <div>
              <label htmlFor="background" className="block text-sm font-medium text-gray-700 mb-1">
                Professional Background:
              </label>
              <textarea
                id="background"
                value={userInfo.background}
                onChange={(e) => setUserInfo({...userInfo, background: e.target.value})}
                className="w-full h-20 p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                placeholder="Brief description of your work experience"
              ></textarea>
            </div>
            
            <div>
              <label htmlFor="optional-info" className="block text-sm font-medium text-gray-700 mb-1">
                Optional Information (Service Preferences, State, etc.):
              </label>
              <textarea
                id="optional-info"
                value={userInfo.optional_info}
                onChange={(e) => setUserInfo({...userInfo, optional_info: e.target.value})}
                className="w-full h-20 p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                placeholder="Any additional information you'd like to provide"
              ></textarea>
            </div>
            
            <div>
              <label htmlFor="num-questions" className="block text-sm font-medium text-gray-700 mb-1">
                Number of Questions:
              </label>
              <input
                type="number"
                id="num-questions"
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                min="5"
                max="15"
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <p className="text-xs text-gray-500 mt-1">
                Recommended: 10 questions for a complete interview experience
              </p>
            </div>
            
            <button
              onClick={configureAndStartInterview}
              className="px-4 py-2 rounded-md font-medium text-white bg-green-700 hover:bg-green-800 w-full"
            >
              {language === "hindi" ? "यूपीएससी साक्षात्कार शुरू करें" : "Start UPSC Interview"}
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div className="flex flex-wrap gap-2 justify-between mb-4">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
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
                onClick={toggleInputMethod}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isUsingText ? "bg-blue-500 hover:bg-blue-600" : "bg-gray-500 hover:bg-gray-600"
                }`}
                disabled={interviewComplete}
              >
                {isUsingText 
                  ? (language === "hindi" ? "आवाज़ पर स्विच करें" : "Switch to Voice") 
                  : (language === "hindi" ? "टेक्स्ट पर स्विच करें" : "Switch to Text")}
              </button>
              
              <button
                onClick={requestSummary}
                className="px-4 py-2 rounded-md font-medium text-white bg-blue-600 hover:bg-blue-700"
                disabled={questions.length === 0}
              >
                {language === "hindi" ? "सारांश प्राप्त करें" : "Get Summary"}
              </button>
              
              <button
                onClick={endInterview}
                className="px-4 py-2 rounded-md font-medium text-white bg-red-600 hover:bg-red-700"
                disabled={interviewComplete}
              >
                {language === "hindi" ? "इंटरव्यू समाप्त करें" : "End Interview"}
              </button>
            </div>
            
            <div className="mb-4">
              <p className="text-gray-600">{getStatusMessage()}</p>
              <p className="text-sm text-gray-500 mt-1">
                {language === "hindi" ? "स्थिति:" : "Status:"} {connectionStatus}
              </p>
            </div>
            
            {boardMembers.length > 0 && (
              <div className="mb-4">
                <h3 className="text-md font-medium mb-2">UPSC Board Members:</h3>
                <div className="flex flex-wrap gap-2">
                  {boardMembers.map((member, index) => (
                    <div key={index} className="bg-green-100 px-3 py-1 rounded-full text-sm font-medium text-green-800">
                      {typeof member === 'string' ? member : member.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="mb-6 space-y-4">
              <h3 className="text-lg font-semibold">Interview Progress</h3>
              <div className="bg-white p-4 rounded-md shadow-sm border border-gray-200 max-h-96 overflow-y-auto">
                {questions.length > 0 ? (
                  questions.map((q, index) => (
                    <div 
                      key={index} 
                      className={`mb-4 p-4 rounded-md ${
                        q === currentQuestion 
                          ? 'bg-green-50 border border-green-200' 
                          : 'bg-gray-50 border border-gray-200'
                      }`}
                    >
                      <p className="font-medium text-gray-700 mb-1">
                        {q.board_member ? `${q.board_member}:` : "Question:"}
                      </p>
                      <p className="text-lg">{q.question}</p>
                      {q.feedback && (
                        <div className="mt-2 text-sm text-gray-600 border-t border-gray-200 pt-2">
                          <p className="font-medium">Feedback:</p>
                          <p>{q.feedback}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">The interview will start shortly...</p>
                )}
                <div ref={questionEndRef}></div>
              </div>
            </div>
            
            {currentQuestion && isUsingText && (
              <div className="mb-4">
                <label htmlFor="text-answer" className="block text-sm font-medium text-gray-700 mb-1">
                  {language === "hindi" ? "अपना उत्तर लिखें:" : "Type your answer:"}
                </label>
                <div className="flex gap-2">
                  <textarea
                    id="text-answer"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                    placeholder={language === "hindi" ? "यहां अपनी प्रतिक्रिया लिखें..." : "Type your response here..."}
                    rows={3}
                    disabled={interviewComplete}
                  ></textarea>
                  <button
                    onClick={submitTextAnswer}
                    className="px-4 py-2 h-fit rounded-md font-medium text-white bg-green-600 hover:bg-green-700"
                    disabled={!textAnswer.trim() || interviewComplete}
                  >
                    {language === "hindi" ? "सबमिट करें" : "Submit"}
                  </button>
                </div>
              </div>
            )}
            
            {summary && (
              <div className="mt-6 p-5 bg-blue-50 border border-blue-100 rounded-md">
                <h3 className="text-lg font-semibold mb-3">UPSC Interview Summary</h3>
                {/* Debug information - consider removing in production */}
                <div className="mb-4 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-32">
                  <pre>{JSON.stringify(summary, null, 2)}</pre>
                </div>
                {summary.scores && (
                  <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <p className="text-sm text-gray-600">Communication</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {summary.scores.communication}/10
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <p className="text-sm text-gray-600">Knowledge</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {summary.scores.knowledge}/10
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <p className="text-sm text-gray-600">Presence</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {summary.scores.presence}/10
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-md shadow-sm">
                      <p className="text-sm text-gray-600">Overall</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {summary.scores.overall}/10
                      </p>
                    </div>
                  </div>
                )}
                {summary.overall_feedback && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Overall Feedback:</h4>
                    <div className="bg-white p-3 rounded-md">
                      <p className="whitespace-pre-wrap">{summary.overall_feedback}</p>
                    </div>
                  </div>
                )}
                {summary.questions && Array.isArray(summary.questions) && summary.questions.length > 0 ? (
                  <div>
                    <h4 className="font-medium mb-2">Question & Answer Review:</h4>
                    <div className="space-y-3">
                      {summary.questions.map((item, index) => (
                        <div key={index} className="bg-white p-3 rounded-md">
                          <p className="font-medium">{item.board_member || "Board Member"}:</p>
                          <p className="ml-2 mb-2">{item.question || "No question recorded"}</p>
                          <p className="font-medium">Your Answer:</p>
                          <p className="ml-2 mb-2 text-gray-700">{item.answer || "No answer recorded"}</p>
                          {item.feedback && (
                            <>
                              <p className="font-medium">Feedback:</p>
                              <p className="ml-2 text-gray-600">{item.feedback}</p>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4 bg-gray-50 rounded-md">
                    <p className="text-gray-600">Detailed question review not available yet.</p>
                    <p className="text-sm text-gray-500">
                      {isSummaryLoading ? "Generating summary..." : "Summary may be incomplete. Try again or check server logs."}
                    </p>
                    {summaryError && (
                      <p className="text-red-500 text-sm mt-2">{summaryError}</p>
                    )}
                    {!isSummaryLoading && (
                      <button 
                        onClick={requestSummary}
                        className="mt-3 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      >
                        Try Again
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {isSummaryLoading && !summary && (
              <div className="mt-6 p-5 bg-blue-50 border border-blue-100 rounded-md text-center">
                <p className="text-gray-600">
                  {language === "hindi" ? "आपका इंटरव्यू सारांश तैयार किया जा रहा है..." : "Generating your interview summary..."}
                </p>
                <div className="mt-3 flex justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound - UPSC Interview Simulator
      </footer>
    </div>
  );
}
