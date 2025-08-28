import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { createAuthenticatedSocket } from "../socket";
import { useAuth } from "../context/AuthContext";
import VideoStream from "../components/VideoStream";
import AnalyticsDashboard from "../components/AnalyticsDashboard";
import RoomSettings from "../components/RoomSettings";
import UserManagement from "../components/UserManagement";
import JoinPrivateRoomModal from "../components/JoinPrivateRoomModal";
import type { Socket } from "socket.io-client";
import { sanitizeMessage } from "../utils/sanitize";

interface ChatMessage {
    id: string;
    name: string;
    message: string;
    timestamp?: Date;
}

interface RoomUser {
    id: string;
    name: string;
    role?: 'owner' | 'moderator' | 'member';
}

interface RoomInfo {
    id: string;
    name: string;
    description: string;
    isPrivate: boolean;
}

interface RoomCustomization {
    primary_color?: string;
    background_color?: string;
    text_color?: string;
    accent_color?: string;
    logo_url?: string;
    welcome_message?: string;
    enable_chat?: boolean;
    enable_video?: boolean;
    enable_screen_share?: boolean;
    enable_analytics?: boolean;
}

interface RoomPermissions {
    can_broadcast?: boolean;
    can_kick_users?: boolean;
    can_delete_messages?: boolean;
    can_invite_users?: boolean;
    can_manage_room?: boolean;
}

function EventRoom() {
  const { id: roomId } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [usersInRoom, setUsersInRoom] = useState<RoomUser[]>([]);
  const [isRoomLoading, setIsRoomLoading] = useState(true);
  
  // New state for room security and customization
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [userRole, setUserRole] = useState<string>('member');
  const [permissions, setPermissions] = useState<RoomPermissions>({});
  const [customization, setCustomization] = useState<RoomCustomization>({});
  const [showSettings, setShowSettings] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [showWelcomeMessage, setShowWelcomeMessage] = useState(false);

  // Memoize the receiveMessage handler
  const handleReceiveMessage = useCallback((data: ChatMessage) => {
    setMessages((prev) => [...prev, data]);
  }, []);

  useEffect(() => {
    const newSocket = createAuthenticatedSocket();
    setSocket(newSocket);

    newSocket.connect();

    newSocket.on("connect", () => {
        setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
        setIsConnected(false);
    });

    // Room joined successfully with all info
    newSocket.on("roomJoined", (data: {
        room: RoomInfo;
        role: string;
        permissions: RoomPermissions;
        customization: RoomCustomization;
    }) => {
        setRoomInfo(data.room);
        setUserRole(data.role);
        setPermissions(data.permissions || {});
        setCustomization(data.customization || {});
        
        // Apply theme
        if (data.customization) {
            applyTheme(data.customization);
        }
        
        // Show welcome message
        if (data.customization && data.customization.welcome_message) {
            setShowWelcomeMessage(true);
            setTimeout(() => setShowWelcomeMessage(false), 5000);
        }
        setIsRoomLoading(false);
    });

    newSocket.on("error", (data: { message: string }) => {
      setIsRoomLoading(false);
        if (data.message === "Invalid room password") {
            setShowPasswordModal(true);
            setJoinError(data.message);
        } else if (data.message === "Room is full") {
            setJoinError(data.message);
            setTimeout(() => navigate("/"), 3000);
        } else {
            setJoinError(data.message);
        }
    });

    // Only set up the message listener once
    newSocket.on("receiveMessage", handleReceiveMessage);

    newSocket.on("messageHistory", (history: ChatMessage[]) => {
        setMessages(history);
    });

    newSocket.on("roomUsers", (users: RoomUser[]) => {
        setUsersInRoom(users);
    });

    newSocket.on("userJoined", (data: { 
        message: string; 
        userId: string; 
        userName: string; 
        role?: string;
        users: RoomUser[] 
    }) => {
        setMessages((prev) => [...prev, { 
            id: "system", 
            name: "System",
            message: data.message 
        }]);
        if (data.users) {
            setUsersInRoom(data.users);
        }
    });

    newSocket.on("userLeft", (data: { 
        message: string; 
        userId: string; 
        userName: string; 
        users: RoomUser[] 
    }) => {
        setMessages((prev) => [...prev, { 
            id: "system", 
            name: "System",
            message: data.message 
        }]);
        if (data.users) {
            setUsersInRoom(data.users);
        }
    });

    newSocket.on("userRoleChanged", (data: { userId: string; newRole: string }) => {
        if (data.userId === user?.id) {
            setUserRole(data.newRole);
        }
        setUsersInRoom(prev => prev.map(u => 
            u.id === data.userId ? { ...u, role: data.newRole as RoomUser["role"] } : u
        ));
    });

    newSocket.on("kicked", (data: { message: string }) => {
        alert(data.message);
        navigate("/");
    });

    newSocket.on("customizationUpdated", (data: RoomCustomization) => {
        setCustomization(data);
        applyTheme(data);
    });

    // Attempt to join room
    const password = location.state?.password || "";
    const isNewRoom = location.state?.isNewRoom || false;

    if (isNewRoom) {
      setTimeout(() => {
        newSocket.emit("joinRoom", roomId, password);
      }, 500);
    } else {
      newSocket.emit("joinRoom", roomId, password);
    }

    return () => {
        newSocket.off("connect");
        newSocket.off("disconnect");
        // newSocket.off("roomJoined");
        // newSocket.off("error");
        // newSocket.off("receiveMessage");
        // newSocket.off("messageHistory");
        // newSocket.off("userJoined");
        // newSocket.off("userLeft");
        // newSocket.off("roomUsers");
        // newSocket.off("userRoleChanged");
        // newSocket.off("kicked");
        // newSocket.off("customizationUpdated");
        newSocket.disconnect();
    };
  }, [roomId, navigate, location.state, user?.id, handleReceiveMessage]);

  const applyTheme = (theme: RoomCustomization) => {
    if (theme.primary_color) {
        document.documentElement.style.setProperty('--primary-color', theme.primary_color);
    }
    if (theme.background_color) {
        document.documentElement.style.setProperty('--bg-color', theme.background_color);
    }
    if (theme.text_color) {
        document.documentElement.style.setProperty('--text-color', theme.text_color);
    }
    if (theme.accent_color) {
        document.documentElement.style.setProperty('--accent-color', theme.accent_color);
    }
  };

  const handleJoinWithPassword = (password: string) => {
    if (socket) {
        socket.emit("joinRoom", roomId, password);
        setShowPasswordModal(false);
    }
  };

  const sendMessage = () => {
    if (message.trim() && isConnected && socket && customization.enable_chat !== false) {
      const sanitized = sanitizeMessage(message);
        socket.emit("sendMessage", {roomId, message: sanitized});
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

  const handleRoleChange = (userId: string, newRole: string) => {
    setUsersInRoom(prev => prev.map(u => 
        u.id === userId ? { ...u, role: newRole as RoomUser["role"] } : u
    ));
  };

  const handleKickUser = (userId: string) => {
    setUsersInRoom(prev => prev.filter(u => u.id !== userId));
  };

  if (joinError && joinError !== "Invalid room password") {
    return (
      <div className="error-page">
        <h2>Unable to join room</h2>
        <p>{joinError}</p>
        <button onClick={() => navigate("/")} className="form-button">
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="event-room" style={{
      backgroundColor: customization.background_color || '#111827',
      color: customization.text_color || '#ffffff'
    }}>
      {/* Header */}
      <div className="room-header">
        <div className="room-info">
          {customization.logo_url && (
            <img src={customization.logo_url} alt="Room Logo" className="room-logo" />
          )}
          <div>
            <h1>{roomInfo?.name || `Room: ${roomId}`}</h1>
            <p>Welcome, {user?.name}! {userRole !== 'member' && `(${userRole})`}</p>
          </div>
        </div>
        <div className="room-actions">
          <div className={`status-indicator ${isConnected ? "status-connected" : "status-disconnected"}`}>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
          {userRole === 'owner' || userRole === 'moderator' || permissions.can_manage_room ? (
            <button onClick={() => setShowSettings(true)} className="header-button">
                ⚙️ Settings
            </button>
          ) : null}
          <button onClick={handleLeaveRoom} className="header-button">
            Leave Room
          </button>
          <button onClick={handleLogout} className="header-button red">
            Logout
          </button>
        </div>
      </div>

      {/* Welcome Message */}
      {showWelcomeMessage && customization.welcome_message && (
        <div className="welcome-banner">
          {customization.welcome_message}
        </div>
      )}

      <div className="room-layout">
        {/* Main Chat Area */}
        <div className="chat-section">
          {/* Analytics Dashboard */}
          {customization.enable_analytics !== false && (
            <AnalyticsDashboard 
              roomId={roomId || ''} 
              socket={socket} 
            />
          )}
          
          {/* Video Section */}
          {customization.enable_video !== false && (
            <VideoStream 
              socket={socket} 
              roomId={roomId || ''} 
              userId={user?.id || ''} 
              userName={user?.name || ''} 
            />
          )}
          
          {/* Chat Container */}
          {customization.enable_chat !== false ? (
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
          ) : (
            <div className="feature-disabled">
              <p>Chat has been disabled for this room</p>
            </div>
          )}
        </div>

        {/* Users Sidebar */}
        <div className="users-sidebar">
          {showUserManagement && (userRole === 'owner' || userRole === 'moderator') ? (
            <>
              <UserManagement
                users={usersInRoom.map(u => ({
                  ...u,
                  role: u.role ?? "member"
                }))}
                currentUserId={user?.id || ''}
                currentUserRole={userRole}
                roomId={roomId || ''}
                onRoleChange={handleRoleChange}
                onKickUser={handleKickUser}
              />
              <button 
                onClick={() => setShowUserManagement(false)}
                className="back-button"
              >
                ← Back
              </button>
            </>
          ) : (
            <>
              <h3 className="users-header">
                Users in Room ({usersInRoom.length})
                {(userRole === 'owner' || userRole === 'moderator') && (
                  <button 
                    onClick={() => setShowUserManagement(true)}
                    className="manage-users-btn"
                    title="Manage Users"
                  >
                    ⚙️
                  </button>
                )}
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
                      {roomUser.role && roomUser.role !== 'member' && (
                        <span className={`role-badge ${roomUser.role}`}>
                          {roomUser.role}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {usersInRoom.length === 0 && (
                <div className="users-loading">
                  Loading users...
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showPasswordModal && (
        <JoinPrivateRoomModal
          roomId={roomId || ''}
          onJoin={handleJoinWithPassword}
          onCancel={() => {
            setShowPasswordModal(false);
            navigate("/");
          }}
        />
      )}

      {showSettings && (
        <RoomSettings
          roomId={roomId || ''}
          socket={socket}
          userRole={userRole}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

export default EventRoom;