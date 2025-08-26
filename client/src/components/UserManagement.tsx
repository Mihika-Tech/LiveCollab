import { useState } from 'react';

interface User {
  id: string;
  name: string;
  role: 'owner' | 'moderator' | 'member';
}

interface UserManagementProps {
  users: User[];
  currentUserId: string;
  currentUserRole: string;
  roomId: string;
  onRoleChange: (userId: string, newRole: string) => void;
  onKickUser: (userId: string) => void;
}

function UserManagement({ users, currentUserId, currentUserRole, roomId, onRoleChange, onKickUser }: UserManagementProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [showConfirmKick, setShowConfirmKick] = useState(false);

  const canManageUser = (targetRole: string) => {
    if (currentUserRole === 'owner') return true;
    if (currentUserRole === 'moderator' && targetRole === 'member') return true;
    return false;
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${roomId}/users/${userId}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ role: newRole })
      });

      if (response.ok) {
        onRoleChange(userId, newRole);
      }
    } catch (error) {
      console.error('Error changing role:', error);
    }
  };

  const handleKickUser = async () => {
    if (!selectedUserId) return;

    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`http://localhost:4000/api/rooms/${roomId}/users/${selectedUserId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        onKickUser(selectedUserId);
        setShowConfirmKick(false);
        setSelectedUserId(null);
      }
    } catch (error) {
      console.error('Error kicking user:', error);
    }
  };

  return (
    <div className="user-management">
      <h3>👥 Room Members ({users.length})</h3>
      
      <div className="user-list">
        {users.map(user => (
          <div key={user.id} className="user-item-extended">
            <div className="user-info">
              <span className="user-name">
                {user.name}
                {user.id === currentUserId && ' (You)'}
              </span>
              <span className={`role-badge ${user.role}`}>
                {user.role}
              </span>
            </div>
            
            {user.id !== currentUserId && canManageUser(user.role) && (
              <div className="user-actions">
                {currentUserRole === 'owner' && (
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value)}
                    className="role-select"
                  >
                    <option value="member">Member</option>
                    <option value="moderator">Moderator</option>
                    {currentUserRole === 'owner' && <option value="owner">Owner</option>}
                  </select>
                )}
                
                <button
                  onClick={() => {
                    setSelectedUserId(user.id);
                    setShowConfirmKick(true);
                  }}
                  className="kick-button"
                  title="Remove user"
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showConfirmKick && (
        <div className="confirm-dialog">
          <p>Are you sure you want to remove this user from the room?</p>
          <div className="confirm-actions">
            <button onClick={() => setShowConfirmKick(false)} className="form-button secondary">
              Cancel
            </button>
            <button onClick={handleKickUser} className="form-button red">
              Remove User
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;