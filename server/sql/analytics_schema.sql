-- Analytics tables for LiveCollab
USE livecollab;

-- Room analytics table
CREATE TABLE room_analytics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_id VARCHAR(50) NOT NULL,
    event_type ENUM('user_joined', 'user_left', 'message_sent', 'broadcast_started', 'broadcast_stopped') NOT NULL,
    user_id INT,
    user_name VARCHAR(255),
    data JSON, -- Additional event data
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_room_time (room_id, created_at),
    INDEX idx_event_time (event_type, created_at)
);

-- Session analytics table
CREATE TABLE session_analytics (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_id VARCHAR(50) NOT NULL,
    user_id INT NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMP NULL,
    duration_minutes INT GENERATED ALWAYS AS (
        CASE 
            WHEN session_end IS NOT NULL 
            THEN TIMESTAMPDIFF(MINUTE, session_start, session_end)
            ELSE NULL 
        END
    ) STORED,
    messages_sent INT DEFAULT 0,
    was_broadcaster BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_room_session (room_id, session_start),
    INDEX idx_user_session (user_id, session_start)
);

-- Real-time metrics table (for current active data)
CREATE TABLE room_metrics (
    room_id VARCHAR(50) PRIMARY KEY,
    current_users INT DEFAULT 0,
    total_messages INT DEFAULT 0,
    active_broadcasters INT DEFAULT 0,
    peak_users INT DEFAULT 0,
    session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Insert initial metrics for existing rooms
INSERT IGNORE INTO room_metrics (room_id, current_users, total_messages) 
SELECT id, 0, 0 FROM rooms;

-- 