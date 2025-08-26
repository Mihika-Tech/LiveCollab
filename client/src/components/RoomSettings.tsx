import { useState, useEffect } from 'react';
import type { Socket } from 'socket.io-client';

interface RoomSettingsProps {
  roomId: string;
  socket: Socket | null;
  userRole: string;
  onClose: () => void;
}

interface RoomPermissions {
  can_broadcast: boolean;
  can_kick_users: boolean;
  can_delete_messages: boolean;
  can_invite_users: boolean;
  can_manage_room: boolean;
}

interface RoomCustomization {
  primary_color: string;
  background_color: string;
  text_color: string;
  accent_color: string;
  logo_url: string;
  welcome_message: string;
  enable_chat: boolean;
  enable_video: boolean;
  enable_screen_share: boolean;
  enable_recordings: boolean;
  enable_analytics: boolean;
  auto_record: boolean;
}

function RoomSettings({ roomId, userRole, onClose }: RoomSettingsProps) {
  const [activeTab, setActiveTab] = useState('general');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Security settings
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState('');
  const [maxParticipants, setMaxParticipants] = useState(100);
  const [permissions, setPermissions] = useState<{ [role: string]: RoomPermissions }>({
    owner: {
      can_broadcast: true,
      can_kick_users: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_manage_room: true
    },
    moderator: {
      can_broadcast: true,
      can_kick_users: true,
      can_delete_messages: true,
      can_invite_users: true,
      can_manage_room: false
    },
    member: {
      can_broadcast: true,
      can_kick_users: false,
      can_delete_messages: false,
      can_invite_users: true,
      can_manage_room: false
    }
  });

  // Customization settings - using database field names
  const [customization, setCustomization] = useState<RoomCustomization>({
    primary_color: '#3b82f6',
    background_color: '#111827',
    text_color: '#ffffff',
    accent_color: '#10b981',
    logo_url: '',
    welcome_message: '',
    enable_chat: true,
    enable_video: true,
    enable_screen_share: true,
    enable_recordings: false,
    enable_analytics: true,
    auto_record: false
  });

  const fetchRoomSettings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:4000/api/rooms/${roomId}/settings`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      
      // Update state with fetched data
      if (data.room) {
        setIsPrivate(data.room.is_private || false);
        setMaxParticipants(data.room.max_participants || 100);
      }
      
      if (data.permissions) {
        setPermissions(data.permissions);
      }
      
      if (data.customization) {
        setCustomization(data.customization);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setError('Failed to load room settings');
    }
  };

  useEffect(() => {
    fetchRoomSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const updateSecuritySettings = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:4000/api/rooms/${roomId}/security`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          isPrivate,
          password: password || undefined,
          maxParticipants,
          permissions
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update security settings');
      }

      setSuccess('Security settings updated successfully');
      setPassword(''); // Clear password field
    } catch {
      setError('Failed to update security settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateCustomizationSettings = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('token');
      
      // Convert to camelCase for API
      const apiCustomization = {
        primaryColor: customization.primary_color,
        backgroundColor: customization.background_color,
        textColor: customization.text_color,
        accentColor: customization.accent_color,
        logoUrl: customization.logo_url,
        welcomeMessage: customization.welcome_message,
        enableChat: customization.enable_chat,
        enableVideo: customization.enable_video,
        enableScreenShare: customization.enable_screen_share,
        enableRecordings: customization.enable_recordings,
        enableAnalytics: customization.enable_analytics,
        autoRecord: customization.auto_record
      };
      
      const response = await fetch(`http://localhost:4000/api/rooms/${roomId}/customization`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(apiCustomization)
      });

      if (!response.ok) {
        throw new Error('Failed to update customization');
      }

      setSuccess('Customization updated successfully');
      
      // Apply theme immediately
      applyTheme(customization);
    } catch {
      setError('Failed to update customization');
    } finally {
      setIsLoading(false);
    }
  };

  const applyTheme = (theme: RoomCustomization) => {
    document.documentElement.style.setProperty('--primary-color', theme.primary_color);
    document.documentElement.style.setProperty('--bg-color', theme.background_color);
    document.documentElement.style.setProperty('--text-color', theme.text_color);
    document.documentElement.style.setProperty('--accent-color', theme.accent_color);
  };

  const updatePermission = (role: string, permission: keyof RoomPermissions, value: boolean) => {
    setPermissions(prev => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permission]: value
      }
    }));
  };

  const updateCustomizationField = (field: keyof RoomCustomization, value: string | boolean) => {
    setCustomization(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (userRole !== 'owner' && userRole !== 'moderator') {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Room Settings</h2>
            <button onClick={onClose} className="close-button">×</button>
          </div>
          <p style={{ textAlign: 'center', padding: '40px', color: '#9ca3af' }}>
            Only room owners and moderators can access settings.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Room Settings</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>

        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}

        <div className="settings-tabs">
          <button
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            Security
          </button>
          <button
            className={`tab ${activeTab === 'customization' ? 'active' : ''}`}
            onClick={() => setActiveTab('customization')}
          >
            Customization
          </button>
          {userRole === 'owner' && (
            <button
              className={`tab ${activeTab === 'permissions' ? 'active' : ''}`}
              onClick={() => setActiveTab('permissions')}
            >
              Permissions
            </button>
          )}
        </div>

        <div className="settings-content">
          {activeTab === 'general' && (
            <div className="settings-section">
              <h3>General Settings</h3>
              <div className="form-group">
                <label>Room ID</label>
                <input type="text" value={roomId} disabled className="form-input" />
              </div>
              <div className="form-group">
                <label>Max Participants</label>
                <input
                  type="number"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(parseInt(e.target.value) || 100)}
                  min={1}
                  max={500}
                  className="form-input"
                />
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="settings-section">
              <h3>Security Settings</h3>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                  />
                  Private Room (Password Protected)
                </label>
              </div>
              {isPrivate && (
                <div className="form-group">
                  <label>New Password (leave empty to keep current)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="form-input"
                  />
                </div>
              )}
              <button
                onClick={updateSecuritySettings}
                disabled={isLoading}
                className="form-button"
              >
                {isLoading ? 'Updating...' : 'Update Security Settings'}
              </button>
            </div>
          )}

          {activeTab === 'customization' && (
            <div className="settings-section">
              <h3>Appearance</h3>
              <div className="color-grid">
                <div className="form-group">
                  <label>Primary Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customization.primary_color}
                      onChange={(e) => updateCustomizationField('primary_color', e.target.value)}
                      className="color-input"
                    />
                    <input
                      type="text"
                      value={customization.primary_color}
                      onChange={(e) => updateCustomizationField('primary_color', e.target.value)}
                      className="form-input small"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Background Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customization.background_color}
                      onChange={(e) => updateCustomizationField('background_color', e.target.value)}
                      className="color-input"
                    />
                    <input
                      type="text"
                      value={customization.background_color}
                      onChange={(e) => updateCustomizationField('background_color', e.target.value)}
                      className="form-input small"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Text Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customization.text_color}
                      onChange={(e) => updateCustomizationField('text_color', e.target.value)}
                      className="color-input"
                    />
                    <input
                      type="text"
                      value={customization.text_color}
                      onChange={(e) => updateCustomizationField('text_color', e.target.value)}
                      className="form-input small"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Accent Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customization.accent_color}
                      onChange={(e) => updateCustomizationField('accent_color', e.target.value)}
                      className="color-input"
                    />
                    <input
                      type="text"
                      value={customization.accent_color}
                      onChange={(e) => updateCustomizationField('accent_color', e.target.value)}
                      className="form-input small"
                    />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>Logo URL</label>
                <input
                  type="url"
                  value={customization.logo_url}
                  onChange={(e) => updateCustomizationField('logo_url', e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Welcome Message</label>
                <textarea
                  value={customization.welcome_message}
                  onChange={(e) => updateCustomizationField('welcome_message', e.target.value)}
                  placeholder="Welcome to our room!"
                  className="form-input"
                  rows={3}
                />
              </div>

              <h3>Features</h3>
              <div className="feature-toggles">
                <label>
                  <input
                    type="checkbox"
                    checked={customization.enable_chat}
                    onChange={(e) => updateCustomizationField('enable_chat', e.target.checked)}
                  />
                  Enable Chat
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={customization.enable_video}
                    onChange={(e) => updateCustomizationField('enable_video', e.target.checked)}
                  />
                  Enable Video
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={customization.enable_screen_share}
                    onChange={(e) => updateCustomizationField('enable_screen_share', e.target.checked)}
                  />
                  Enable Screen Share
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={customization.enable_recordings}
                    onChange={(e) => updateCustomizationField('enable_recordings', e.target.checked)}
                  />
                  Enable Recordings
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={customization.enable_analytics}
                    onChange={(e) => updateCustomizationField('enable_analytics', e.target.checked)}
                  />
                  Enable Analytics
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={customization.auto_record}
                    onChange={(e) => updateCustomizationField('auto_record', e.target.checked)}
                  />
                  Auto-Record Sessions
                </label>
              </div>

              <button
                onClick={updateCustomizationSettings}
                disabled={isLoading}
                className="form-button"
              >
                {isLoading ? 'Updating...' : 'Update Customization'}
              </button>
            </div>
          )}

          {activeTab === 'permissions' && userRole === 'owner' && (
            <div className="settings-section">
              <h3>Role Permissions</h3>
              
              {['moderator', 'member'].map(role => (
                <div key={role} className="permission-group">
                  <h4>{role.charAt(0).toUpperCase() + role.slice(1)}</h4>
                  <div className="permission-list">
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions[role].can_broadcast}
                        onChange={(e) => updatePermission(role, 'can_broadcast', e.target.checked)}
                      />
                      Can Start Video/Screen Share
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions[role].can_kick_users}
                        onChange={(e) => updatePermission(role, 'can_kick_users', e.target.checked)}
                      />
                      Can Remove Users
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions[role].can_delete_messages}
                        onChange={(e) => updatePermission(role, 'can_delete_messages', e.target.checked)}
                      />
                      Can Delete Messages
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={permissions[role].can_invite_users}
                        onChange={(e) => updatePermission(role, 'can_invite_users', e.target.checked)}
                      />
                      Can Invite Users
                    </label>
                  </div>
                </div>
              ))}

              <button
                onClick={updateSecuritySettings}
                disabled={isLoading}
                className="form-button"
              >
                {isLoading ? 'Updating...' : 'Update Permissions'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RoomSettings;