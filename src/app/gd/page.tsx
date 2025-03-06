"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { GroupDiscussionWebSocket, GDConfig, GDMessage } from "@/lib/gd-ws";

export default function GroupDiscussion() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [messages, setMessages] = useState<GDMessage[]>([]);
  const [topic, setTopic] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [discussionComplete, setDiscussionComplete] = useState<boolean>(false);
  const [summary, setSummary] = useState<string>("");
  const [isAnalysisRequested, setIsAnalysisRequested] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [currentSpeaker, setCurrentSpeaker] = useState<string>("");

  const gdWsRef = useRef<GroupDiscussionWebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const speakingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sample topic suggestions
  const topicSuggestions = [
    "Is AI a threat to human jobs?",
    "Should college education be free?",
    "Is remote work better than office work?",
    "Should social media be regulated?",
    "Is nuclear energy the future?",
    "Are cryptocurrencies a good investment?",
    "Should voting be mandatory?",
    "Is space exploration worth the cost?",
  ];

  // Initialize WebSocket instance
  useEffect(() => {
    gdWsRef.current = new GroupDiscussionWebSocket("ws://localhost:8765");
    
    // Set up event listeners
    gdWsRef.current.addMessageListener((message) => {
      setMessages(prev => [...prev, message]);
      setCurrentSpeaker(message.name);
      
      // Visual indicator for bot speaking
      setIsSpeaking(true);
      // Clear any existing timer
      if (speakingTimerRef.current) {
        clearTimeout(speakingTimerRef.current);
      }
      // Set timer to clear speaking indicator after 2 seconds
      speakingTimerRef.current = setTimeout(() => {
        setIsSpeaking(false);
        setCurrentSpeaker("");
      }, 2000);
    });
    
    gdWsRef.current.addStatusChangeListener((status) => {
      setConnectionStatus(status);
      
      if (status === "ready") {
        setIsConfigured(true);
        // Auto-start recording when ready
        startRecording();
      } else if (status === "complete") {
        setDiscussionComplete(true);
        setIsRecording(false);
      } else if (status === "disconnected") {
        setIsConfigured(false);
        setIsRecording(false);
      } else if (status === "recording") {
        setIsRecording(true);
        setIsMicMuted(false);
      } else if (status === "muted") {
        setIsMicMuted(true);
      } else if (status === "paused") {
        setIsRecording(false);
      }
    });
    
    gdWsRef.current.addErrorListener((error) => {
      console.error("GD Error:", error);
      // Add error to messages
      setMessages(prev => [...prev, {name: "System", content: `Error: ${error}`}]);
    });
    
    gdWsRef.current.addAnalysisListener((message, history) => {
      setSummary(message);
      setDiscussionComplete(true);
      if (history) {
        // Update with complete message history if provided
        setMessages(history);
      }
    });
    
    return () => {
      // Cleanup timers
      if (speakingTimerRef.current) {
        clearTimeout(speakingTimerRef.current);
      }
      
      // Disconnect WebSocket
      if (gdWsRef.current) {
        gdWsRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the bottom when new messages arrive
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const configureAndStartDiscussion = async () => {
    if (!topic.trim()) {
      alert("Please provide a topic for the group discussion");
      return;
    }

    if (!userName.trim()) {
      alert("Please provide your name");
      return;
    }
    
    try {
      const config: GDConfig = {
        topic: topic,
        user_name: userName
      };
      
      if (gdWsRef.current) {
        await gdWsRef.current.configure(config);
        // Note: startRecording will be triggered by the "ready" status change
      }
    } catch (error) {
      console.error("Error configuring group discussion:", error);
    }
  };

  const startRecording = async () => {
    try {
      if (gdWsRef.current) {
        await gdWsRef.current.startRecording();
        setIsRecording(true);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
    }
  };

  const toggleRecording = () => {
    if (gdWsRef.current) {
      if (isRecording) {
        gdWsRef.current.stopRecording();
        setIsRecording(false);
      } else {
        startRecording();
      }
    }
  };

  const toggleMicrophone = () => {
    if (gdWsRef.current && isRecording) {
      if (isMicMuted) {
        // Unmute - resume sending audio
        gdWsRef.current.resumeAudio();
        setIsMicMuted(false);
      } else {
        // Mute - pause sending audio without stopping recording
        gdWsRef.current.pauseAudio();
        setIsMicMuted(true);
      }
    }
  };

  const requestAnalysis = () => {
    if (gdWsRef.current) {
      gdWsRef.current.requestAnalysis();
      setIsAnalysisRequested(true);
    }
  };

  const clearMessages = () => {
    setMessages([]);
  };

  const handleTopicSelect = (selectedTopic: string) => {
    setTopic(selectedTopic);
  };

  const getBotColor = (botName: string) => {
    if (botName === "Bot 1") return "bg-blue-100 text-blue-900";
    if (botName === "Bot 2") return "bg-purple-100 text-purple-900";
    if (botName === "Bot 3") return "bg-orange-100 text-orange-900";
    if (botName === "Moderator") return "bg-gray-100 text-gray-800";
    if (botName === "System") return "bg-red-100 text-red-900";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-green-600 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Group Discussion</h1>
        {isConfigured && (
          <div className="flex items-center gap-2">
            <span className={`inline-block w-3 h-3 rounded-full ${isRecording ? (isMicMuted ? 'bg-yellow-500' : 'bg-green-500 animate-pulse') : 'bg-gray-500'}`}></span>
            <span className="text-sm">{
              isRecording 
                ? (isMicMuted ? 'Mic Muted' : 'Recording') 
                : 'Paused'
            }</span>
            {isSpeaking && currentSpeaker && (
              <span className="ml-4 text-sm bg-white text-green-800 px-2 py-1 rounded animate-pulse">
                {currentSpeaker} speaking...
              </span>
            )}
          </div>
        )}
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div>
              <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 mb-1">
                Your Name:
              </label>
              <input
                type="text"
                id="user-name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                placeholder="Enter your name"
              />
            </div>
            
            <div>
              <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-1">
                Discussion Topic:
              </label>
              <input
                type="text"
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                placeholder="Enter the topic for discussion"
              />
            </div>
            
            <div>
              <p className="block text-sm font-medium text-gray-700 mb-2">
                Or choose from suggestions:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {topicSuggestions.map((suggestedTopic, index) => (
                  <div 
                    key={index}
                    className={`p-2 border rounded-md cursor-pointer text-sm ${
                      topic === suggestedTopic 
                        ? 'bg-green-100 border-green-400' 
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                    onClick={() => handleTopicSelect(suggestedTopic)}
                  >
                    {suggestedTopic}
                  </div>
                ))}
              </div>
            </div>
            
            <button
              onClick={configureAndStartDiscussion}
              className="px-4 py-2 rounded-md font-medium text-white bg-green-600 hover:bg-green-700 w-full"
              disabled={!topic.trim() || !userName.trim()}
            >
              Start Discussion
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div className="flex flex-wrap justify-between gap-2 mb-4">
              <button 
                onClick={toggleRecording}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                }`}
                disabled={discussionComplete}
              >
                {isRecording ? "Pause Discussion" : "Resume Discussion"}
              </button>
              
              <button
                onClick={toggleMicrophone}
                className={`px-4 py-2 rounded-md font-medium text-white ${
                  isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                }`}
                disabled={!isRecording || discussionComplete}
              >
                {isMicMuted ? "Unmute Mic" : "Mute Mic"}
              </button>
              
              <button
                onClick={requestAnalysis}
                className="px-4 py-2 rounded-md font-medium text-white bg-indigo-500 hover:bg-indigo-600"
                disabled={discussionComplete || isAnalysisRequested}
              >
                {isAnalysisRequested ? "Analysis Requested..." : "End & Get Summary"}
              </button>
              
              <button
                onClick={clearMessages}
                className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
              >
                Clear Messages
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="font-medium text-green-700">
                Current Topic: {topic}
              </p>
              <p className="text-gray-600 mt-1">
                {discussionComplete 
                  ? "Discussion complete! Thank you for participating."
                  : isRecording 
                    ? isMicMuted 
                      ? "Microphone muted. Click 'Unmute Mic' to continue."
                      : "Discussion in progress... Speak naturally when you want to contribute." 
                    : "Click 'Resume Discussion' to continue."}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className={`h-2 w-2 rounded-full ${
                  connectionStatus === "ready" || connectionStatus === "recording" 
                    ? "bg-green-500" 
                    : connectionStatus === "muted" 
                      ? "bg-yellow-500"
                      : "bg-gray-500"
                }`}></div>
                <p className="text-xs text-gray-500">Status: {connectionStatus}</p>
              </div>
            </div>

            {discussionComplete && summary && (
              <div className="mb-4 p-4 bg-indigo-50 border border-indigo-200 rounded-md">
                <h3 className="font-medium text-indigo-800 mb-2">Discussion Summary:</h3>
                <p className="whitespace-pre-wrap text-gray-800">{summary}</p>
              </div>
            )}
            
            {/* Display messages */}
            <div className="mt-4 bg-white border border-gray-200 rounded-md shadow-sm">
              <h3 className="border-b border-gray-200 px-4 py-2 font-medium flex items-center justify-between">
                <span>Discussion</span>
                <span className="text-xs text-gray-500">{messages.length} messages</span>
              </h3>
              <div className="max-h-96 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">
                    No messages yet. Start speaking to contribute to the discussion.
                  </p>
                ) : (
                  messages.map((msg, index) => (
                    <div 
                      key={index} 
                      className={`mb-4 ${msg.name === userName ? 'text-right' : ''}`}
                    >
                      <div 
                        className={`inline-block max-w-3/4 rounded-lg px-4 py-2 ${
                          msg.name === userName 
                            ? 'bg-green-100 text-green-900' 
                            : getBotColor(msg.name)
                        }`}
                      >
                        <p className="text-xs font-bold">
                          {msg.name === userName ? "You" : msg.name}
                        </p>
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            {isRecording && !isMicMuted && !discussionComplete && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-md text-center">
                <p className="text-blue-800 text-sm">
                  Your microphone is active. Speak naturally to participate in the discussion.
                  The AI participants will respond after you speak.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound
      </footer>
    </div>
  );
}
