import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function CreateRoomModal({ isOpen, onClose }: CreateRoomModalProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    roomId: Math.random().toString(36).substring(2, 8),
    name: '',
    description: '',
    isPrivate: false,
    password: '',
    maxParticipants: 100
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:4000/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message);
      }

      // Navigate with password in state for private rooms
      if (formData.isPrivate) {
        navigate(`/room/${formData.roomId}`, { 
          state: { 
            password: formData.password,
            isNewRoom: true  // Flag to indicate this is a newly created room
          } 
        });
      } else {
        navigate(`/room/${formData.roomId}`, { 
          state: { 
            isNewRoom: true 
          } 
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsLoading(false);
    }
  };

  const generateNewRoomId = () => {
    setFormData({
      ...formData,
      roomId: Math.random().toString(36).substring(2, 8)
    });
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Room</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="create-room-form">
          <div className="form-group">
            <label htmlFor="roomId">Room ID</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                id="roomId"
                value={formData.roomId}
                onChange={(e) => setFormData({...formData, roomId: e.target.value})}
                required
                className="form-input"
                style={{ flex: 1 }}
                pattern="[a-zA-Z0-9]+"
                title="Room ID can only contain letters and numbers"
              />
              <button
                type="button"
                onClick={generateNewRoomId}
                className="form-button secondary"
                style={{ width: 'auto' }}
              >
                Generate
              </button>
            </div>
            <small style={{ color: '#9ca3af', marginTop: '4px', display: 'block' }}>
              Share this ID with others to let them join your room
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="name">Room Name</label>
            <input
              type="text"
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
              className="form-input"
              placeholder="My Awesome Room"
              maxLength={100}
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              className="form-input"
              rows={3}
              placeholder="What's this room about?"
              maxLength={500}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={formData.isPrivate}
                onChange={(e) => setFormData({...formData, isPrivate: e.target.checked})}
              />
              <span>Private Room (Password Protected)</span>
            </label>
            <small style={{ color: '#9ca3af', marginTop: '4px', display: 'block' }}>
              Private rooms require a password to join
            </small>
          </div>

          {formData.isPrivate && (
            <div className="form-group">
              <label htmlFor="password">Room Password</label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required={formData.isPrivate}
                className="form-input"
                placeholder="Enter a secure password"
                minLength={6}
              />
              <small style={{ color: '#9ca3af', marginTop: '4px', display: 'block' }}>
                Minimum 6 characters. Share this with trusted participants only.
              </small>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="maxParticipants">Max Participants</label>
            <input
              type="number"
              id="maxParticipants"
              value={formData.maxParticipants}
              onChange={(e) => setFormData({...formData, maxParticipants: parseInt(e.target.value) || 100})}
              min={1}
              max={500}
              className="form-input"
            />
            <small style={{ color: '#9ca3af', marginTop: '4px', display: 'block' }}>
              Maximum number of users allowed in the room (1-500)
            </small>
          </div>

          <div className="form-actions">
            <button type="button" onClick={onClose} className="form-button secondary">
              Cancel
            </button>
            <button type="submit" disabled={isLoading} className="form-button">
              {isLoading ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateRoomModal;