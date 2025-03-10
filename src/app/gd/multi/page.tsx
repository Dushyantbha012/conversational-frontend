"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { GroupDiscussionWebSocket, DiscussionMessage, GroupDiscussionConfig } from "@/lib/gd/gd-multiple";

export default function GroupDiscussionPage() {
  // State for UI display
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [discussionTopic, setDiscussionTopic] = useState<string>("");
  const [discussionCode, setDiscussionCode] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isAnalysisRequested, setIsAnalysisRequested] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<string>("");
  const [discussionComplete, setDiscussionComplete] = useState<boolean>(false);
  const [activeParticipants, setActiveParticipants] = useState<number>(0);
  const [showJoinForm, setShowJoinForm] = useState<boolean>(true);
  const [joinMode, setJoinMode] = useState<"create" | "join">("create");
  const [inputCode, setInputCode] = useState<string>("");

  // Refs
  const gdWsRef = useRef<GroupDiscussionWebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize WebSocket client
  useEffect(() => {
    gdWsRef.current = new GroupDiscussionWebSocket("ws://localhost:8765");
    
    // Set up event listeners
    gdWsRef.current.addMessageListener((name, content) => {
      console.log(`Received message from ${name}: ${content}`);
      setMessages(prev => {
        // Check if the previous message was from the same user
        if (prev.length > 0 && prev[prev.length - 1].name === name) {
          // Create a copy of the previous messages array
          const updatedMessages = [...prev];
          // Get the last message
          const lastMessage = updatedMessages[updatedMessages.length - 1];
          // Update the last message by merging the content
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: `${lastMessage.content} ${content}`,
            timestamp: Date.now() // Update timestamp to current time
          };
          return updatedMessages;
        } else {
          // Add as a new message if it's from a different user
          return [...prev, { name, content, timestamp: Date.now() }];
        }
      });
    });
    
    gdWsRef.current.addStatusChangeListener((status, details) => {
      setConnectionStatus(status);
      
      if (status === "created" || status === "joined") {
        setIsConfigured(true);
        setShowJoinForm(false);
        setDiscussionCode(details?.code || "");
        setDiscussionTopic(details?.topic || "");
        // Auto-start recording when ready
        startRecording();
      } else if (status === "analyzing") {
        setIsAnalysisRequested(true);
      } else if (status === "disconnected") {
        setIsConfigured(false);
        setIsRecording(false);
      }
    });
    
    gdWsRef.current.addErrorListener((error) => {
      alert(`Error: ${error}`);
    });
    
    gdWsRef.current.addParticipantListener((userName, isJoining, activeCount) => {
      const action = isJoining ? "joined" : "left";
      setMessages(prev => [...prev, {
        name: "System",
        content: `${userName} has ${action} the discussion.`,
        timestamp: Date.now()
      }]);
      setActiveParticipants(activeCount);
    });
    
    gdWsRef.current.addAnalysisListener((analysis, history) => {
      setAnalysisResult(analysis);
      setDiscussionComplete(true);
      setIsRecording(false);
      if (history) {
        // Add any missing messages from history
        setMessages(prev => {
          // Create a set of existing message combinations (name+content)
          const existingMessages = new Set(prev.map(m => `${m.name}:${m.content}`));
          
          // Filter history to only include messages not already in our state
          const newMessages = history.filter(
            m => !existingMessages.has(`${m.name}:${m.content}`)
          );
          
          return [...prev, ...newMessages];
        });
      }
    });
    
    return () => {
      // Cleanup
      if (gdWsRef.current) {
        gdWsRef.current.disconnect();
      }
    };
  }, []);

  // Auto-scroll to the bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const startDiscussion = async () => {
    if (!userName.trim()) {
      alert("Please enter your name to join the discussion");
      return;
    }
    
    // For join mode, verify code was provided
    if (joinMode === "join" && !inputCode.trim()) {
      alert("Please enter a valid discussion code to join");
      return;
    }
    
    // For create mode, verify topic was provided
    if (joinMode === "create" && !discussionTopic.trim()) {
      alert("Please enter a topic for the discussion");
      return;
    }
    
    try {
      const config: GroupDiscussionConfig = {
        action: joinMode,
        user_name: userName.trim()
      };
      
      // Add topic or code based on mode
      if (joinMode === "create") {
        config.topic = discussionTopic.trim();
      } else {
        config.code = inputCode.trim();
      }
      
      if (gdWsRef.current) {
        await gdWsRef.current.configure(config);
      }
    } catch (error) {
      console.error("Error configuring discussion:", error);
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

  const copyDiscussionCode = () => {
    if (discussionCode) {
      navigator.clipboard.writeText(discussionCode)
        .then(() => {
          alert("Discussion code copied to clipboard!");
        })
        .catch(err => {
          alert(`Could not copy code: ${err}`);
        });
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-purple-600 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">Group Discussion</h1>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {showJoinForm ? (
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
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Enter your name"
              />
            </div>
            
            <div className="flex space-x-4 mb-4">
              <button
                onClick={() => setJoinMode("create")}
                className={`flex-1 px-4 py-2 rounded-md font-medium ${
                  joinMode === "create" 
                    ? "bg-purple-600 text-white" 
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                Create Discussion
              </button>
              <button
                onClick={() => setJoinMode("join")}
                className={`flex-1 px-4 py-2 rounded-md font-medium ${
                  joinMode === "join" 
                    ? "bg-purple-600 text-white" 
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                Join Discussion
              </button>
            </div>
            
            {joinMode === "create" ? (
              <div>
                <label htmlFor="topic" className="block text-sm font-medium text-gray-700 mb-1">
                  Discussion Topic:
                </label>
                <input
                  type="text"
                  id="topic"
                  value={discussionTopic}
                  onChange={(e) => setDiscussionTopic(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Enter discussion topic"
                />
              </div>
            ) : (
              <div>
                <label htmlFor="discussion-code" className="block text-sm font-medium text-gray-700 mb-1">
                  Discussion Code:
                </label>
                <input
                  type="text"
                  id="discussion-code"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                  className="w-full p-2 border border-gray-300 rounded-md"
                  placeholder="Enter the discussion code (e.g., ABC123)"
                />
              </div>
            )}
            
            <button
              onClick={startDiscussion}
              className="px-4 py-2 rounded-md font-medium text-white bg-purple-600 hover:bg-purple-700 w-full"
            >
              {joinMode === "create" ? "Create & Join" : "Join Discussion"}
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 className="font-medium text-lg">{discussionTopic}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Code: {discussionCode}</span>
                  <button 
                    onClick={copyDiscussionCode}
                    className="text-purple-600 hover:text-purple-800"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm">Participants: {activeParticipants}</p>
                <p className="text-sm">Status: {connectionStatus}</p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={toggleRecording}
                  className={`px-3 py-1 rounded-md font-medium text-white ${
                    isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                  }`}
                  disabled={discussionComplete}
                >
                  {isRecording ? "Pause" : "Resume"}
                </button>
                
                <button
                  onClick={toggleMicrophone}
                  className={`px-3 py-1 rounded-md font-medium text-white ${
                    isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                  }`}
                  disabled={!isRecording || discussionComplete}
                >
                  {isMicMuted ? "Unmute" : "Mute"}
                </button>
                
                <button
                  onClick={requestAnalysis}
                  className="px-3 py-1 rounded-md font-medium text-white bg-purple-500 hover:bg-purple-600"
                  disabled={discussionComplete || isAnalysisRequested}
                >
                  {isAnalysisRequested ? "Analyzing..." : "Finish & Analyze"}
                </button>
              </div>
            </div>
            
            {/* Discussion messages */}
            <div className="bg-white border border-gray-200 rounded-md shadow-sm">
              <div className="bg-gray-50 rounded-md p-4 max-h-96 overflow-y-auto">
                {messages.length === 0 ? (
                  <p className="text-center text-gray-500 my-6">
                    The discussion will begin shortly. Start speaking when ready.
                  </p>
                ) : (
                  messages.map((msg, index) => (
                    <div key={index} className={`mb-3 pb-3 border-b border-gray-200 last:border-b-0 ${
                      msg.name === "System" ? "text-gray-500 italic text-sm" : ""
                    }`}>
                      <div className="flex justify-between items-baseline mb-1">
                        <span className="font-medium">
                          {msg.name === userName ? "You" : msg.name}:
                        </span>
                        {msg.timestamp && (
                          <span className="text-xs text-gray-500">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-gray-800">{msg.content}</p>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>
            
            {/* Analysis result */}
            {analysisResult && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-2">Discussion Analysis</h3>
                <div className="bg-purple-50 border border-purple-100 rounded-md p-4">
                  <pre className="whitespace-pre-wrap text-gray-800 overflow-auto max-h-96">
                    {analysisResult}
                  </pre>
                </div>
              </div>
            )}
            
            <div className="mt-4 text-sm text-gray-600">
              <p>Tips for a productive discussion:</p>
              <ul className="list-disc ml-5 mt-1">
                <li>Speak clearly and at a normal pace</li>
                <li>Avoid speaking over others</li>
                <li>The system will transcribe your speech</li>
                <li>Virtual participants may join to enhance the discussion</li>
                <li>Use the mute button when you're not speaking</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound
      </footer>
    </div>
  );
}
