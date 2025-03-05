"use client"
import { useEffect, useRef, useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const webSocketRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState('Disconnected');

  useEffect(() => {
    // Setup WebRTC connection
    const setupConnection = async () => {
      try {
        setStatus('Setting up audio...');
        
        // Get user media (audio only)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setStatus('Microphone access granted');
        
        // Create WebSocket connection to Python backend
        const ws = new WebSocket('wss://localhost:8765');
        webSocketRef.current = ws;
        
        ws.onopen = () => {
          setStatus('WebSocket connected');
          setupWebRTC();
        };
        
        ws.onmessage = async (event) => {
          const message = JSON.parse(event.data);
          handleSignalingMessage(message);
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setStatus('Connection error');
        };
        
        ws.onclose = () => {
          setStatus('Connection closed');
        };
      } catch (err) {
        console.error('Setup error:', err);
        setStatus(`Error: ${err.message}`);
      }
    };
    
    const setupWebRTC = () => {
      // Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;
      setStatus('WebRTC connection created');
      
      // Add local audio tracks to connection
      const stream = streamRef.current;
      stream.getAudioTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('Added audio track to connection');
      });
      
      // Handle ICE candidates
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          const message = {
            type: 'candidate',
            candidate
          };
          webSocketRef.current.send(JSON.stringify(message));
        }
      };
      
      pc.oniceconnectionstatechange = () => {
        setStatus(`ICE Connection: ${pc.iceConnectionState}`);
      };
      
      // Create and send offer
      createAndSendOffer();
    };
    
    const createAndSendOffer = async () => {
      try {
        const pc = pcRef.current;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const message = {
          type: 'offer',
          sdp: pc.localDescription.sdp
        };
        
        webSocketRef.current.send(JSON.stringify(message));
        setStatus('Offer sent');
      } catch (err) {
        console.error('Error creating offer:', err);
        setStatus(`Offer error: ${err.message}`);
      }
    };
    
    const handleSignalingMessage = async (message) => {
      try {
        if (message.type === 'answer') {
          const answer = new RTCSessionDescription({
            type: message.type,
            sdp: message.sdp
          });
          
          await pcRef.current.setRemoteDescription(answer);
          setStatus('Connected - You can speak now');
        }
      } catch (err) {
        console.error('Signaling error:', err);
        setStatus(`Signaling error: ${err.message}`);
      }
    };
    
    setupConnection();
    
    // Cleanup
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      pcRef.current?.close();
      webSocketRef.current?.close();
    };
  }, []);
  
  return (
    <div className={styles.container || ''}>
      <h1>Audio Streaming to Python</h1>
      <div className={styles.status || ''}>
        Status: {status}
      </div>
      <p>Speak into your microphone to stream audio to the Python backend</p>
    </div>
  );
}