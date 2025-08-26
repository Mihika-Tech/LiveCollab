import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import CreateRoomModal from "../components/createRoomModal";

function Landing() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [roomId, setRoomId] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [error, setError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const handleJoin = async () => {
    if (!roomId.trim()) return;

    setIsJoining(true);
    setError("");

    try {
      const token = localStorage.getItem('token');
      
      // First, try to verify access
      const response = await fetch(`http://localhost:4000/api/rooms/${roomId}/verify-access`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: roomPassword })
      });

      const data = await response.json();

      if (response.status === 404) {
        setError('Room not found. Please check the room ID.');
        setIsJoining(false);
        return;
      }

      if (response.status === 403) {
        // Room is private and needs password
        if (!showPasswordInput) {
          setShowPasswordInput(true);
          setError('This room is private. Please enter the password.');
        } else {
          setError('Invalid password. Please try again.');
        }
        setIsJoining(false);
        return;
      }

      if (response.ok) {
        // Access granted, navigate to room
        navigate(`/room/${roomId}`, { state: { password: roomPassword } });
      } else {
        setError(data.message || 'Failed to join room');
        setIsJoining(false);
      }
    } catch {
      setError('Failed to connect to server. Please try again.');
      setIsJoining(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && roomId.trim()) {
      handleJoin();
    }
  };

  const handleCreate = () => {
    setShowCreateModal(true);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleRoomIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRoomId(e.target.value);
    // Reset password input when room ID changes
    if (showPasswordInput) {
      setShowPasswordInput(false);
      setRoomPassword("");
      setError("");
    }
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

        {error && (
          <div className="error-message" style={{ marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Room controls */}
        <div className="room-controls">
          <div className="form-group">
            <input
              type="text"
              placeholder="Enter room ID"
              value={roomId}
              onChange={handleRoomIdChange}
              onKeyPress={handleKeyPress}
              className="form-input"
              style={{ marginBottom: showPasswordInput ? '12px' : '0' }}
            />
            
            {showPasswordInput && (
              <input
                type="password"
                placeholder="Enter room password"
                value={roomPassword}
                onChange={(e) => setRoomPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                className="form-input"
                autoFocus
              />
            )}
          </div>
          
          <button
            onClick={handleJoin}
            disabled={!roomId.trim() || isJoining}
            className="form-button"
          >
            {isJoining ? 'Joining...' : 'Join Room'}
          </button>
          
          <div className="room-divider">
            <span>or</span>
          </div>
          
          <button
            onClick={handleCreate}
            className="form-button green"
          >
            🚀 Create New Room
          </button>

          {/* Quick tips */}
          <div style={{ 
            marginTop: '24px', 
            padding: '16px', 
            backgroundColor: '#374151', 
            borderRadius: '8px',
            fontSize: '14px',
            color: '#9ca3af'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600', color: '#ffffff' }}>
              💡 Quick Tips:
            </p>
            <ul style={{ margin: 0, paddingLeft: '20px' }}>
              <li>Room IDs are case-sensitive</li>
              <li>Private rooms require a password to join</li>
              <li>You can customize your room after creating it</li>
              <li>Share the room ID with others to collaborate</li>
            </ul>
          </div>
        </div>

        {/* User info */}
        <div className="user-info">
          <p>Logged in as: {user?.email}</p>
        </div>
      </div>

      {/* Create Room Modal */}
      <CreateRoomModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}

export default Landing;