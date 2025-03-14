"use client";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { TutorWebSocket } from "@/lib/tutor/10th/tutor-ws";
import Image from "next/image";

export default function NCERTTutor() {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [responses, setResponses] = useState<string[]>([]);
  const [textQuestion, setTextQuestion] = useState<string>("");
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected");
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [remainingImages, setRemainingImages] = useState<number>(5);
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const [imageDescription, setImageDescription] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<string>("english");
  const [showLanguageSelector, setShowLanguageSelector] = useState<boolean>(false);

  const tutorWsRef = useRef<TutorWebSocket | null>(null);
  const responseEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Initialize tutor WebSocket instance
  useEffect(() => {
    tutorWsRef.current = new TutorWebSocket("wss://ws3.nextround.tech/tutor");
    
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
      } else if (status === "processing_image") {
        setIsProcessingImage(true);
      } else if (status === "language_selection") {
        // Show language selection when the server requests it
        setShowLanguageSelector(true);
      }
    });
    
    tutorWsRef.current.addErrorListener((error) => {
      setResponses(prev => [...prev, `Error: ${error}`]);
    });
    
    tutorWsRef.current.addExplanationListener((question, explanation) => {
      // Optional: Add specific handling for explanations beyond the general message listener
    });
    
    tutorWsRef.current.addImageProcessedListener((description) => {
      setImageDescription(description);
      setIsProcessingImage(false);
    });
    
    tutorWsRef.current.addLanguageChangeListener((language) => {
      setSelectedLanguage(language);
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

  useEffect(() => {
    // Update remaining images count when tutorWs changes
    if (tutorWsRef.current) {
      setRemainingImages(tutorWsRef.current.remainingImages);
    }
  }, [responses, isConnected]);

  const connectToTutor = async () => {
    try {
      if (tutorWsRef.current) {
        await tutorWsRef.current.connect();
        setRemainingImages(5); // Reset image count on new connection
      }
    } catch (error) {
      console.error("Error connecting to tutor:", error);
    }
  };

  const selectLanguage = (language: string) => {
    if (tutorWsRef.current) {
      tutorWsRef.current.selectLanguage(language);
      setSelectedLanguage(language);
      setShowLanguageSelector(false);
    }
  };

  const changeLanguage = (language: string) => {
    if (tutorWsRef.current) {
      tutorWsRef.current.changeLanguage(language);
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

  const clearHistory = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.clearHistory();
    }
  };

  const disconnect = () => {
    if (tutorWsRef.current) {
      tutorWsRef.current.disconnect();
      // Reset states
      setImageFile(null);
      setImagePreview(null);
      setImageDescription(null);
      setRemainingImages(5);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadImage = async () => {
    if (!imageFile || !imagePreview || !tutorWsRef.current) return;
    
    try {
      // Simple direct approach - using the data URL from preview
      const success = tutorWsRef.current.sendImage(imagePreview);
      
      if (success) {
        setImageFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        setRemainingImages(tutorWsRef.current.remainingImages);
      }
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };

  const cancelImageUpload = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Language selector component
  const LanguageSelector = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-sm w-full">
        <h3 className="text-lg font-medium mb-4 text-center">Select your preferred language</h3>
        <div className="flex justify-center space-x-4">
          <button
            onClick={() => selectLanguage("english")}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            English
          </button>
          <button
            onClick={() => selectLanguage("hindi")}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            हिंदी (Hindi)
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen bg-white text-gray-800">
      <header className="bg-blue-600 text-white py-4 px-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">NCERT 10th Grade Tutor</h1>
        {isConnected && (
          <div className="flex items-center">
            <span className="mr-2 text-sm">
              {selectedLanguage === "hindi" ? "भाषा:" : "Language:"}
            </span>
            <select 
              value={selectedLanguage}
              onChange={(e) => changeLanguage(e.target.value)}
              className="bg-blue-700 text-white px-2 py-1 rounded border-none cursor-pointer"
            >
              <option value="english">English</option>
              <option value="hindi">हिंदी (Hindi)</option>
            </select>
          </div>
        )}
      </header>

      <main className="flex-1 p-6 mx-auto max-w-3xl">
        {showLanguageSelector && <LanguageSelector />}

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
              <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                <button 
                  onClick={toggleRecording}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    isRecording ? "bg-red-500 hover:bg-red-600" : "bg-blue-500 hover:bg-blue-600"
                  }`}
                >
                  {isRecording ? (
                    selectedLanguage === "hindi" ? "वॉइस इनपुट बंद करें" : "Stop Voice Input"
                  ) : (
                    selectedLanguage === "hindi" ? "वॉइस इनपुट शुरू करें" : "Start Voice Input"
                  )}
                </button>
                
                <button
                  onClick={toggleMicrophone}
                  className={`px-4 py-2 rounded-md font-medium text-white ${
                    isMicMuted ? "bg-yellow-500 hover:bg-yellow-600" : "bg-gray-500 hover:bg-gray-600"
                  }`}
                  disabled={!isRecording}
                >
                  {isMicMuted ? (
                    selectedLanguage === "hindi" ? "माइक अनम्यूट करें" : "Unmute Mic"
                  ) : (
                    selectedLanguage === "hindi" ? "माइक म्यूट करें" : "Mute Mic"
                  )}
                </button>
                
                <button
                  onClick={clearResponses}
                  className="px-4 py-2 rounded-md font-medium text-white bg-gray-500 hover:bg-gray-600"
                >
                  {selectedLanguage === "hindi" ? "चैट साफ़ करें" : "Clear Chat"}
                </button>
                
                <button
                  onClick={clearHistory}
                  className="px-4 py-2 rounded-md font-medium text-white bg-indigo-500 hover:bg-indigo-600"
                >
                  {selectedLanguage === "hindi" ? "मेमोरी रीसेट करें" : "Reset Memory"}
                </button>
                
                <button
                  onClick={disconnect}
                  className="px-4 py-2 rounded-md font-medium text-white bg-gray-700 hover:bg-gray-800"
                >
                  {selectedLanguage === "hindi" ? "डिस्कनेक्ट" : "Disconnect"}
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-gray-600">
                  {selectedLanguage === "hindi" ? 
                    (isRecording 
                      ? (isMicMuted 
                        ? "माइक्रोफ़ोन म्यूट है। जारी रखने के लिए 'माइक अनम्यूट करें' पर क्लिक करें।" 
                        : "वॉइस इनपुट सक्रिय है। एनसीईआरटी विषयों के बारे में अपने प्रश्न पूछें।")
                      : "'वॉइस इनपुट शुरू करें' पर क्लिक करके आवाज के माध्यम से प्रश्न पूछें।") :
                    (isRecording 
                      ? isMicMuted 
                        ? "Microphone muted. Click 'Unmute Mic' to continue."
                        : "Voice input active. Ask your questions about NCERT topics." 
                      : "Click 'Start Voice Input' to ask questions by voice.")
                  }
                </p>
                <p className="text-sm text-gray-500 mt-1">Status: {connectionStatus}</p>
              </div>
              
              {/* Image upload section */}
              <div className="border border-gray-300 rounded-md p-4 mb-4">
                <h3 className="font-medium mb-2">
                  {selectedLanguage === "hindi" ? "छवि विश्लेषण" : "Image Analysis"}
                </h3>
                <p className="text-sm text-gray-500 mb-2">
                  {selectedLanguage === "hindi" 
                    ? `पाठ्यपुस्तक पृष्ठ, आरेख, या समस्या की छवि विश्लेषण के लिए अपलोड करें (अधिकतम: ${remainingImages} छवियां शेष)`
                    : `Upload an image of a textbook page, diagram, or problem to analyze (Max: ${remainingImages} images remaining)`
                  }
                </p>
                
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageChange}
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-md file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100"
                    disabled={remainingImages <= 0 || isProcessingImage}
                  />
                  
                  {remainingImages <= 0 && (
                    <span className="text-xs text-red-500">
                      {selectedLanguage === "hindi" 
                        ? "छवि सीमा पहुंच गई" 
                        : "Image limit reached"}
                    </span>
                  )}
                </div>
                
                {imagePreview && (
                  <div className="mt-4">
                    <div className="relative max-w-xs mx-auto">
                      <img 
                        src={imagePreview} 
                        alt="Preview" 
                        className="w-full object-contain border rounded-md max-h-48"
                      />
                    </div>
                    <div className="flex justify-center gap-2 mt-2">
                      <button
                        onClick={uploadImage}
                        disabled={isProcessingImage || remainingImages <= 0}
                        className={`px-3 py-1 rounded text-sm text-white ${
                          isProcessingImage || remainingImages <= 0
                            ? "bg-gray-400"
                            : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {isProcessingImage 
                          ? (selectedLanguage === "hindi" ? "प्रोसेसिंग..." : "Processing...") 
                          : (selectedLanguage === "hindi" ? "छवि का विश्लेषण करें" : "Analyze Image")}
                      </button>
                      <button
                        onClick={cancelImageUpload}
                        className="px-3 py-1 rounded text-sm text-white bg-gray-600 hover:bg-gray-700"
                      >
                        {selectedLanguage === "hindi" ? "रद्द करें" : "Cancel"}
                      </button>
                    </div>
                  </div>
                )}
                
                {isProcessingImage && (
                  <div className="flex items-center justify-center mt-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
                    <span className="ml-2 text-sm text-gray-600">
                      {selectedLanguage === "hindi" 
                        ? "छवि प्रोसेस हो रही है..." 
                        : "Processing image..."}
                    </span>
                  </div>
                )}
              </div>
              
              <div className="relative">
                <textarea
                  value={textQuestion}
                  onChange={(e) => setTextQuestion(e.target.value)}
                  onKeyDown={handleKeyPress}
                  className="w-full p-3 pr-16 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-none"
                  placeholder={
                    selectedLanguage === "hindi"
                      ? "अपना प्रश्न यहां टाइप करें... (भेजने के लिए Enter दबाएँ)"
                      : "Type your question here... (Press Enter to send)"
                  }
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
            <h2 className="text-lg font-semibold mb-2">
              {selectedLanguage === "hindi" ? "ट्यूटर चैट" : "Tutor Chat"}
            </h2>
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
                  ) : response.startsWith("Image processed:") ? (
                    <div className="bg-purple-50 p-3 rounded-lg">
                      <p className="font-medium text-gray-900">
                        {selectedLanguage === "hindi" ? "छवि विश्लेषण:" : "Image Analysis:"}
                      </p>
                      <p className="whitespace-pre-wrap text-gray-800">{response}</p>
                    </div>
                  ) : response.startsWith("Sending image") ? (
                    <div className="bg-blue-50 p-3 rounded-lg max-w-[80%] ml-auto">
                      <p className="whitespace-pre-wrap text-gray-800">{response}</p>
                    </div>
                  ) : response.startsWith("Q:") ? (
                    <div className="space-y-2">
                      <div className="bg-blue-50 p-3 rounded-lg max-w-[80%] ml-auto">
                        <p className="font-medium text-gray-900">
                          {selectedLanguage === "hindi" ? "प्रश्न:" : "Question:"}
                        </p>
                        <p className="whitespace-pre-wrap text-gray-800">{response.split("\n\nA:")[0].substring(3)}</p>
                      </div>
                      <div className="bg-green-50 p-3 rounded-lg">
                        <p className="font-medium text-gray-900">
                          {selectedLanguage === "hindi" ? "उत्तर:" : "Answer:"}
                        </p>
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
