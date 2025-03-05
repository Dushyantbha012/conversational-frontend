import { useEffect } from "react"

export const Receiver = () => {
  useEffect(() => {
    const socket = new WebSocket('ws://localhost:8080');
    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: 'receiver'
      }));
    }
    startReceiving(socket);
  }, []);

  function startReceiving(socket) {
    // ... (implementation omitted for brevity)
  }

  return <div></div>
}