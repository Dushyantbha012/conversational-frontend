import { useEffect, useState } from "react"

export const Sender = () => {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [pc, setPC] = useState<RTCPeerConnection | null>(null);

  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080');
    setSocket(socket);
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'sender'
      }));
    }
  }, []);

  const initiateConn = async () => {
    // ... (implementation omitted for brevity)
  }

  const getCameraStreamAndSend = (pc) => {
    // ... (implementation omitted for brevity)
  }

  return (
    <div>
      Sender
      <button onClick={initiateConn}> Send data </button>
    </div>
  )
}