import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { createAuthenticatedSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import VideoStream from "../components/VideoStream";
import AnalyticsDashboard from "../components/AnalyticsDashboard";
import type { Socket } from "socket.io-client";

interface ChatMessage {
    id: string;
    name: string;
    message: string;
    timestamp?: Date;
}

interface RoomUser {
    id: string;
    name: string;
}

function EventRoom() {
  const { id: roomId } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [usersInRoom, setUsersInRoom] = useState<RoomUser[]>([]);

  useEffect(() => {
    const newSocket = createAuthenticatedSocket();
    setSocket(newSocket);

    newSocket.connect();
    newSocket.emit("joinRoom", roomId);

    newSocket.on("connect", () => {
        setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
        setIsConnected(false);
    });

    newSocket.on("receiveMessage", (data: ChatMessage) => {
        setMessages((prev) => [...prev, data]);
    });

    newSocket.on("messageHistory", (history: ChatMessage[]) => {
        setMessages(history);
    });

    newSocket.on("roomUsers", (users: RoomUser[]) => {
        console.log("Received room users:", users); // Debug log
        setUsersInRoom(users);
    });

    newSocket.on("userJoined", (data: { message: string; userId: string; userName: string; users: RoomUser[] }) => {
        console.log("User joined:", data); // Debug log
        setMessages((prev) => [...prev, { 
            id: "system", 
            name: "System",
            message: data.message 
        }]);
        if (data.users) {
            setUsersInRoom(data.users);
        }
    });

    newSocket.on("userLeft", (data: { message: string; userId: string; userName: string; users: RoomUser[] }) => {
        console.log("User left:", data); // Debug log
        setMessages((prev) => [...prev, { 
            id: "system", 
            name: "System",
            message: data.message 
        }]);
        if (data.users) {
            setUsersInRoom(data.users);
        }
    });

    return () => {
        newSocket.off("connect");
        newSocket.off("disconnect");
        newSocket.off("receiveMessage");
        newSocket.off("messageHistory");
        newSocket.off("userJoined");
        newSocket.off("userLeft");
        newSocket.off("roomUsers");
        newSocket.disconnect();
    };
  }, [roomId]);

  const sendMessage = () => {
    if (message.trim() && isConnected && socket) {
        socket.emit("sendMessage", {roomId, message});
        setMessage("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
        sendMessage();
    }
  };

  const handleLeaveRoom = () => {
    if (socket) {
      // Properly disconnect to trigger server-side cleanup
      socket.disconnect();
    }
    navigate("/");
  };

  const handleLogout = () => {
    if (socket) {
        socket.disconnect();
    }
    logout();
    navigate("/login");
  };

  return (
    <div className="event-room">
      {/* Header */}
      <div className="room-header">
        <div className="room-info">
          <h1>Room: {roomId}</h1>
          <p>Welcome, {user?.name}!</p>
        </div>
        <div className="room-actions">
          <div className={`status-indicator ${isConnected ? "status-connected" : "status-disconnected"}`}>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
          <button onClick={handleLeaveRoom} className="header-button">
            Leave Room
          </button>
          <button onClick={handleLogout} className="header-button red">
            Logout
          </button>
        </div>
      </div>

      <div className="room-layout">
        {/* Main Chat Area */}
        <div className="chat-section">
          {/* Analytics Dashboard */}
          <AnalyticsDashboard 
            roomId={roomId || ''} 
            socket={socket} 
          />
          
          {/* Video Section */}
          <VideoStream 
            socket={socket} 
            roomId={roomId || ''} 
            userId={user?.id || ''} 
            userName={user?.name || ''} 
          />
          
          <div className="chat-container">
            <div className="messages-area">
              {messages.length === 0 ? (
                <div className="no-messages">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`message ${
                      msg.id === user?.id ? "own" : 
                      msg.id === "system" ? "system" : "other"
                    }`}
                  >
                    <div className="message-header">
                      {msg.id === user?.id ? "You" : 
                       msg.id === "system" ? "System" :
                       msg.name}
                    </div>
                    <div className="message-content">{msg.message}</div>
                    {msg.timestamp && (
                      <div className="message-timestamp">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Message Input */}
            <div className="message-input-area">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                disabled={!isConnected}
                className="message-input"
              />
              <button
                onClick={sendMessage}
                disabled={!isConnected || !message.trim()}
                className="send-button"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Users Sidebar */}
        <div className="users-sidebar">
          <h3 className="users-header">
            Users in Room ({usersInRoom.length})
          </h3>
          <div className="users-list">
            {usersInRoom.map((roomUser) => (
              <div
                key={roomUser.id}
                className={`user-item ${roomUser.id === user?.id ? "current-user" : "other-user"}`}
              >
                <div className="user-status"></div>
                <div className="user-name">
                  {roomUser.id === user?.id ? `${roomUser.name} (You)` : roomUser.name}
                </div>
              </div>
            ))}
          </div>

          {usersInRoom.length === 0 && (
            <div className="users-loading">
              Loading users...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default EventRoom;