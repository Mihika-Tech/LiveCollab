import { useState } from 'react';

interface JoinPrivateRoomModalProps {
  roomId: string;
  onJoin: (password: string) => void;
  onCancel: () => void;
}

function JoinPrivateRoomModal({ roomId, onJoin, onCancel }: JoinPrivateRoomModalProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Please enter a password');
      return;
    }
    onJoin(password);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content small">
        <div className="modal-header">
          <h3>🔒 Private Room</h3>
          <button onClick={onCancel} className="close-button">×</button>
        </div>
        
        <p style={{ color: '#9ca3af', marginBottom: '16px' }}>
          Room <strong>{roomId}</strong> requires a password to join
        </p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              placeholder="Enter room password"
              className="form-input"
              autoFocus
              required
            />
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onCancel} className="form-button secondary">
              Cancel
            </button>
            <button type="submit" className="form-button">
              Join Room
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default JoinPrivateRoomModal;