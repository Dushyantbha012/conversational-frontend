"use client";

import { useEffect, useRef, useState } from "react";
import React from "react";
import { TutorWebSocket, TutorExplanation, ImageProcessedResponse } from "@/lib/tutor/tutor-ws";
import ReactMarkdown from 'react-markdown';

export default function NCERTTutor() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConfigured, setIsConfigured] = useState<boolean>(false);
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [userQuestion, setUserQuestion] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [explanations, setExplanations] = useState<Array<{question: string; explanation: string}>>([]);
  const [messages, setMessages] = useState<string[]>([]);
  const [processingImage, setProcessingImage] = useState<boolean>(false);
  const [processingQuestion, setProcessingQuestion] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [imageDescription, setImageDescription] = useState<string | null>(null);
  const [imagesProcessed, setImagesProcessed] = useState<number>(0);
  const [listeningMode, setListeningMode] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const tutorWsRef = useRef<TutorWebSocket | null>(null);
  const explanationsEndRef = useRef<HTMLDivElement | null>(null);
  
  // Initialize tutor WebSocket instance
  useEffect(() => {
    console.log("Initializing TutorWebSocket");
    
    // Check if WebSocket is supported
    if (!window.WebSocket) {
      setErrorMessage("WebSocket is not supported by your browser");
      setConnectionStatus("error");
      return;
    }
    
    try {
      tutorWsRef.current = new TutorWebSocket("wss://ws3.nextround.tech/tutor");
      
      // Set up event listeners
      tutorWsRef.current.addMessageListener((message) => {
        console.log("Message received:", message);
        setMessages(prev => [...prev, message]);
      });
      
      tutorWsRef.current.addStatusChangeListener((status) => {
        console.log("Status changed to:", status);
        setConnectionStatus(status);
        
        if (status === "ready" || status === "connected") {
          setIsConfigured(true);
          setConnectionError(null);
        } else if (status === "disconnected") {
          setIsConfigured(false);
          setIsRecording(false);
          setListeningMode(false);
        }
      });
      
      tutorWsRef.current.addExplanationListener((response) => {
        console.log("Explanation received:", response);
        setExplanations(prev => [...prev, {
          question: response.question,
          explanation: response.explanation
        }]);
        setProcessingQuestion(false);
      });
      
      tutorWsRef.current.addImageProcessedListener((response) => {
        console.log("Image processed:", response);
        setProcessingImage(false);
        setImageDescription(response.description);
        setImagesProcessed(prev => prev + 1);
        setMessages(prev => [...prev, `Image processed: ${response.message}`]);
      });
      
      tutorWsRef.current.addErrorListener((error) => {
        console.error("Error from tutor:", error);
        setProcessingImage(false);
        setProcessingQuestion(false);
        setErrorMessage(error.message);
        
        // Handle specific connection errors
        if (error.message.includes("Connection") || error.message.includes("connect")) {
          setConnectionError(error.message);
        }
        
        setTimeout(() => setErrorMessage(null), 5000);
      });
    } catch (error) {
      console.error("Error creating TutorWebSocket:", error);
      setErrorMessage(`Failed to initialize connection: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return () => {
      // Cleanup
      if (tutorWsRef.current) {
        tutorWsRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to the bottom when new explanations arrive
    if (explanationsEndRef.current) {
      explanationsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [explanations]);

  const configureTutor = async () => {
    try {
      setErrorMessage(null);
      setConnectionError(null);
      setConnectionStatus("connecting");
      setMessages(prev => [...prev, "Connecting to NCERT Tutor..."]);
      
      if (tutorWsRef.current) {
        await tutorWsRef.current.configure();
        setMessages(prev => [...prev, "NCERT Tutor connected and ready!"]);
      }
    } catch (error) {
      console.error("Error configuring tutor:", error);
      setErrorMessage(`Failed to connect to the tutor service: ${error instanceof Error ? error.message : String(error)}`);
      setConnectionError("Connection failed. Please check your internet connection and try again.");
      setConnectionStatus("error");
    }
  };

  const startRecording = async () => {
    try {
      if (tutorWsRef.current) {
        await tutorWsRef.current.startRecording();
        setIsRecording(true);
        setListeningMode(true);
        setMessages(prev => [...prev, "Voice mode activated - speak your question"]);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
      setErrorMessage("Microphone access denied or not available");
    }
  };

  const stopRecording = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.stopRecording();
      setIsRecording(false);
      setListeningMode(false);
      setMessages(prev => [...prev, "Voice mode deactivated"]);
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
        tutorWsRef.current.resumeAudio();
        setIsMicMuted(false);
        setMessages(prev => [...prev, "Microphone unmuted"]);
      } else {
        tutorWsRef.current.pauseAudio();
        setIsMicMuted(true);
        setMessages(prev => [...prev, "Microphone muted"]);
      }
    }
  };

  const sendQuestion = () => {
    if (tutorWsRef.current && userQuestion.trim()) {
      tutorWsRef.current.sendQuestion(userQuestion);
      setProcessingQuestion(true);
      setMessages(prev => [...prev, `Question sent: ${userQuestion}`]);
      setUserQuestion("");
    }
  };

  const processImage = () => {
    if (tutorWsRef.current && imageUrl.trim()) {
      tutorWsRef.current.sendImageForProcessing(imageUrl);
      setProcessingImage(true);
      setMessages(prev => [...prev, `Processing image: ${imageUrl}`]);
      setImageUrl("");
    }
  };

  const clearHistory = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.clearHistory();
      setExplanations([]);
      setMessages(prev => [...prev, "Conversation history cleared"]);
    }
  };

  const disconnect = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.disconnect();
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-green-600 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">NCERT Tutor</h1>
        <p className="text-sm">Your AI learning companion for NCERT curriculum</p>
      </header>

      <main className="flex-1 p-6 mx-auto max-w-4xl">
        {!isConfigured ? (
          <div className="p-6 space-y-4 bg-gray-50 rounded-md shadow-sm">
            <h2 className="text-xl font-semibold">Connect to NCERT Tutor</h2>
            <p className="text-gray-600">
              Get instant help with your NCERT curriculum questions. You can ask questions, upload images of textbook pages or problems, and get detailed explanations.
            </p>
            
            {connectionError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 mb-4">
                <p><strong>Connection Error:</strong> {connectionError}</p>
                <p className="text-sm mt-2">
                  Possible causes:
                  <ul className="list-disc ml-5 mt-1">
                    <li>Your internet connection might be unstable</li>
                    <li>The tutor service might be temporarily unavailable</li>
                    <li>There might be browser restrictions blocking the WebSocket connection</li>
                  </ul>
                </p>
              </div>
            )}
            
            <button
              onClick={configureTutor}
              disabled={connectionStatus === "connecting"}
              className={`px-4 py-2 rounded-md font-medium text-white ${
                connectionStatus === "connecting" 
                  ? "bg-gray-400" 
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {connectionStatus === "connecting" ? "Connecting..." : "Connect to Tutor"}
            </button>
            
            {connectionStatus === "connecting" && (
              <p className="text-sm text-gray-500 animate-pulse">Establishing connection...</p>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Controls */}
            <div className="p-4 bg-gray-50 rounded-md shadow-sm">
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={toggleRecording}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    isRecording ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                  }`}
                >
                  {isRecording ? "Stop Voice Input" : "Start Voice Input"}
                </button>
                
                {isRecording && (
                  <button
                    onClick={toggleMicrophone}
                    className={`px-4 py-2 rounded-md font-medium text-white ${
                      isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                    }`}
                  >
                    {isMicMuted ? "Unmute Mic" : "Mute Mic"}
                  </button>
                )}
                
                <button
                  onClick={clearHistory}
                  className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
                >
                  Clear History
                </button>
                
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded-md font-medium text-white bg-red-500 hover:bg-red-600"
                >
                  Disconnect
                </button>
              </div>
              
              <div className="mb-2">
                <p className="text-gray-600">
                  {listeningMode 
                    ? "Voice mode active: Speak your question clearly into the microphone"
                    : "Type your question or upload an image to get help"
                  }
                </p>
                <p className="text-sm text-gray-500">Status: {connectionStatus}</p>
                {imagesProcessed > 0 && (
                  <p className="text-sm text-green-600">{imagesProcessed} images processed</p>
                )}
              </div>
              
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-600 mb-4">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Text Question Input */}
            <div className="p-4 bg-gray-50 rounded-md shadow-sm">
              <h3 className="font-medium mb-2">Ask a Question</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={userQuestion}
                  onChange={(e) => setUserQuestion(e.target.value)}
                  placeholder="Type your NCERT question here..."
                  className="flex-1 p-2 border border-gray-300 rounded-md"
                  onKeyPress={(e) => e.key === 'Enter' && sendQuestion()}
                />
                <button
                  onClick={sendQuestion}
                  disabled={processingQuestion || !userQuestion.trim()}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    processingQuestion ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {processingQuestion ? "Processing..." : "Ask"}
                </button>
              </div>
            </div>

            {/* Image Upload */}
            <div className="p-4 bg-gray-50 rounded-md shadow-sm">
              <h3 className="font-medium mb-2">Process an Image</h3>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="Paste image URL (NCERT textbook page, problem, etc.)"
                  className="flex-1 p-2 border border-gray-300 rounded-md"
                  onKeyPress={(e) => e.key === 'Enter' && processImage()}
                />
                <button
                  onClick={processImage}
                  disabled={processingImage || !imageUrl.trim()}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    processingImage ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"
                  }`}
                >
                  {processingImage ? "Processing..." : "Process Image"}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Note: Images must be publicly accessible URLs (max 5 images per session)
              </p>
            </div> 
        
            {/* Image Description (if available) */}
            {imageDescription && (
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-md">
                <h3 className="font-medium mb-2">Last Processed Image Content:</h3>
                <div className="max-h-60 overflow-y-auto text-sm">
                  <ReactMarkdown>{imageDescription}</ReactMarkdown>
                </div>
              </div>
            )}

            {/* Status Messages */}
            {messages.length > 0 && (
              <div className="p-4 bg-gray-50 rounded-md shadow-sm">
                <h3 className="font-medium mb-2">System Messages:</h3>
                <div className="max-h-40 overflow-y-auto text-sm">
                  {messages.map((message, index) => (
                    <p key={index} className="mb-1 text-gray-600">{message}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Explanations */}
            <div className="space-y-4">
              <h3 className="font-medium">Explanations:</h3>
              {explanations.length > 0 ? (
                <div className="space-y-6">
                  {explanations.map((item, index) => (
                    <div key={index} className="p-4 bg-gray-50 rounded-md shadow-sm">
                      <div className="font-medium mb-2 px-3 py-2 bg-green-100 rounded-md">
                        Q: {item.question}
                      </div>
                      <div className="prose max-w-none">
                        <ReactMarkdown>{item.explanation}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                  <div ref={explanationsEndRef} />
                </div>
              ) : (
                <p className="text-gray-500 italic">No explanations yet. Ask a question to begin!</p>
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="bg-gray-100 py-4 text-center text-sm text-gray-500">
        © 2025 NextRound - NCERT Tutor
      </footer>
    </div>
  );
}
