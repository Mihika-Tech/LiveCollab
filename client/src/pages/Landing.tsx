import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";

function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [roomId, setRoomId] = useState("");

  const handleJoin = () => {
    if (roomId.trim()) {
      navigate(`/room/${roomId}`);
    }
  };

  const handleCreate = () => {
    const newRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${newRoomId}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="landing-page">
      <div className="landing-card">
        {/* Header with user info */}
        <div className="landing-header">
          <h1 className="auth-title">🎥 LiveCollab</h1>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>

        {/* Welcome message */}
        <div className="welcome-section">
          <p className="welcome-text">
            Welcome back, <span className="welcome-name">{user?.name}</span>!
          </p>
          <p className="welcome-subtitle">
            Join an existing room or create a new one
          </p>
        </div>

        {/* Room controls */}
        <div className="room-controls">
          <input
            type="text"
            placeholder="Enter room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            className="form-input"
          />
          
          <button
            onClick={handleJoin}
            disabled={!roomId.trim()}
            className="form-button"
          >
            Join Room
          </button>
          
          <div className="room-divider">or</div>
          
          <button
            onClick={handleCreate}
            className="form-button green"
          >
            Create New Room
          </button>
        </div>

        {/* User info */}
        <div className="user-info">
          <p>Logged in as: {user?.email}</p>
        </div>
      </div>
    </div>
  );
}

export default Landing;