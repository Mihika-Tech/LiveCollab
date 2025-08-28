require('dotenv').config();
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Database helper functions
const db = {
    // Execute a query
    async query(sql, params = []) {
        try {
            const [rows] = await pool.execute(sql, params);
            return rows;
        } catch (error) {
            console.error('Database query error:', error);
            throw error;
        }
    },

    // Get a single row
    async queryOne(sql, params = []) {
        const rows = await this.query(sql, params);
        return rows[0] || null;
    },

    // User operations
    users: {
        async create(name, email, hashedPassword) {
            const result = await db.query(
                'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                [name, email, hashedPassword]
            );
            return result.insertId;
        },

        async findByEmail(email) {
            return await db.queryOne(
                'SELECT * FROM users WHERE email = ?',
                [email]
            );
        },

        async findById(id) {
            return await db.queryOne(
                'SELECT id, name, email, created_at FROM users WHERE id = ?',
                [id]
            );
        },

        async updateLastActive(id) {
            await db.query(
                'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [id]
            );
        }
    },

    // Room operations
    rooms: {
        async create(roomId, name, description, createdBy, isPrivate = false, password = null) {
            await db.query(
                `INSERT INTO rooms (id, name, description, created_by, is_private, password) 
                VALUES (?, ?, ?, ?, ?, ?) 
                ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
                [roomId, name, description, createdBy, isPrivate, password]
            );
            
            // Create default customization
            await db.query(
                'INSERT INTO room_customizations (room_id) VALUES (?)',
                [roomId]
            );
            
            // Set creator as owner
            await db.query(
                `INSERT IGNORE INTO room_permissions (room_id, role, can_broadcast, can_kick_users, can_delete_messages, can_invite_users, can_manage_room)
                VALUES 
                (?, 'owner', TRUE, TRUE, TRUE, TRUE, TRUE),
                (?, 'moderator', TRUE, TRUE, TRUE, TRUE, FALSE),
                (?, 'member', TRUE, FALSE, FALSE, TRUE, FALSE)`,
                [roomId, roomId, roomId]
            );
            
            return roomId;
        },

        async findById(roomId) {
            return await db.queryOne(
                'SELECT * FROM rooms WHERE id = ?',
                [roomId]
            );
        },

        async exists(roomId) {
            const room = await db.queryOne(
                'SELECT id FROM rooms WHERE id = ?',
                [roomId]
            );
            return !!room;
        },

        async verifyPassword(roomId, password) {
            const room = await this.findById(roomId);
            if (!room || !room.is_private) return true;
            
            const bcrypt = require('bcryptjs');
            return await bcrypt.compare(password, room.password);
        },

        async updateSettings(roomId, settings) {
            const { isPrivate, password, maxParticipants } = settings;
            let hashedPassword = null;
            
            if (isPrivate && password) {
                const bcrypt = require('bcryptjs');
                hashedPassword = await bcrypt.hash(password, 10);
            }
            
            await db.query(
                `UPDATE rooms SET is_private = ?, password = ?, max_participants = ? WHERE id = ?`,
                [isPrivate, hashedPassword, maxParticipants, roomId]
            );
        }
    },

    // Message operations
    messages: {
        async create(roomId, userId, userName, message) {
            const result = await db.query(
                'INSERT INTO messages (room_id, user_id, user_name, message) VALUES (?, ?, ?, ?)',
                [roomId, userId, userName, message]
            );
            return result.insertId;
        },

        async getHistory(roomId, limit = 50) {
            // Fix: Use template literal for LIMIT
            const limitNum = parseInt(limit) || 50;
            return await db.query(
                `SELECT user_id as id, user_name as name, message, created_at as timestamp 
                FROM messages 
                WHERE room_id = ? 
                ORDER BY created_at DESC 
                LIMIT ${limitNum}`,
                [roomId]
            );
        },

        async getLatest(roomId, limit = 50) {
            const messages = await this.getHistory(roomId, limit);
            return messages.reverse(); // Return in chronological order
        }
    },

    // Room users operations
    roomUsers: {
        async addUser(roomId, userId, userName, socketId) {
            await db.query(
                'INSERT INTO room_users (room_id, user_id, user_name, socket_id) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE socket_id = VALUES(socket_id), last_active = CURRENT_TIMESTAMP',
                [roomId, userId, userName, socketId]
            );
        },

        async removeUser(roomId, userId) {
            await db.query(
                'DELETE FROM room_users WHERE room_id = ? AND user_id = ?',
                [roomId, userId]
            );
        },

        async removeBySocketId(socketId) {
            const user = await db.queryOne(
                'SELECT room_id, user_id, user_name FROM room_users WHERE socket_id = ?',
                [socketId]
            );
            
            if (user) {
                await db.query(
                    'DELETE FROM room_users WHERE socket_id = ?',
                    [socketId]
                );
                return user;
            }
            return null;
        },

        async getRoomUsers(roomId) {
            return await db.query(
                'SELECT user_id as id, user_name as name, joined_at FROM room_users WHERE room_id = ? ORDER BY joined_at ASC',
                [roomId]
            );
        },

        async getUserRooms(userId) {
            return await db.query(
                'SELECT room_id FROM room_users WHERE user_id = ?',
                [userId]
            );
        },

        async updateActivity(roomId, userId) {
            await db.query(
                'UPDATE room_users SET last_active = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ?',
                [roomId, userId]
            );
        }
    },
    roomSecurity: {
    async getUserRole(roomId, userId) {
        const result = await db.queryOne(
            'SELECT role FROM room_users WHERE room_id = ? AND user_id = ?',
            [roomId, userId]
        );
        return result ? result.role : null;
    },

    async updateUserRole(roomId, userId, role) {
        await db.query(
            'UPDATE room_users SET role = ? WHERE room_id = ? AND user_id = ?',
            [role, roomId, userId]
        );
    },

    async getPermissions(roomId, role) {
        return await db.queryOne(
            'SELECT * FROM room_permissions WHERE room_id = ? AND role = ?',
            [roomId, role]
        );
    },

    async updatePermissions(roomId, role, permissions) {
        const fields = Object.keys(permissions).map(key => `${key} = ?`).join(', ');
        const values = Object.values(permissions);
        
        await db.query(
            `UPDATE room_permissions SET ${fields} WHERE room_id = ? AND role = ?`,
            [...values, roomId, role]
        );
    },

    async canUserPerformAction(roomId, userId, action) {
        const role = await this.getUserRole(roomId, userId);
        if (!role) return false;
        
        const permissions = await this.getPermissions(roomId, role);
        return permissions ? permissions[action] : false;
    }
},

roomCustomization: {
    async get(roomId) {
        return await db.queryOne(
            'SELECT * FROM room_customizations WHERE room_id = ?',
            [roomId]
        );
    },

    async update(roomId, customizations) {
        const fields = Object.keys(customizations).map(key => `${key} = ?`).join(', ');
        const values = Object.values(customizations);
        
        await db.query(
            `UPDATE room_customizations SET ${fields} WHERE room_id = ?`,
            [...values, roomId]
        );
    },

    async getTheme(roomId) {
        const custom = await this.get(roomId);
        if (!custom) return null;
        
        return {
            primaryColor: custom.primary_color,
            backgroundColor: custom.background_color,
            textColor: custom.text_color,
            accentColor: custom.accent_color,
            logoUrl: custom.logo_url,
            welcomeMessage: custom.welcome_message
        };
    }
},

    // Analytics operations
    analytics: {
        async logEvent(roomId, eventType, userId, userName, data = null) {
            await db.query(
                'INSERT INTO room_analytics (room_id, event_type, user_id, user_name, data) VALUES (?, ?, ?, ?, ?)',
                [roomId, eventType, userId, userName, JSON.stringify(data)]
            );
        },

        async startSession(roomId, userId, userName) {
            await db.query(
                'INSERT INTO session_analytics (room_id, user_id, user_name) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_start = CURRENT_TIMESTAMP, messages_sent = 0',
                [roomId, userId, userName]
            );
        },

        async endSession(roomId, userId) {
            await db.query(
                'UPDATE session_analytics SET session_end = CURRENT_TIMESTAMP WHERE room_id = ? AND user_id = ? AND session_end IS NULL',
                [roomId, userId]
            );
        },

        async incrementMessageCount(roomId, userId) {
            await db.query(
                'UPDATE session_analytics SET messages_sent = messages_sent + 1 WHERE room_id = ? AND user_id = ? AND session_end IS NULL',
                [roomId, userId]
            );
        },

        async updateRoomMetrics(roomId, updates) {
            const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            await db.query(
                `UPDATE room_metrics SET ${setClause}, last_activity = CURRENT_TIMESTAMP WHERE room_id = ?`,
                [...values, roomId]
            );
        },

        async getRoomMetrics(roomId) {
            return await db.queryOne(
                'SELECT * FROM room_metrics WHERE room_id = ?',
                [roomId]
            );
        },

        async getRecentActivity(roomId, hours = 24) {
            return await db.query(
                'SELECT event_type, COUNT(*) as count, DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00") as hour FROM room_analytics WHERE room_id = ? AND created_at >= NOW() - INTERVAL ? HOUR GROUP BY event_type, hour ORDER BY hour',
                [roomId, hours]
            );
        },

        async getSessionStats(roomId) {
            return await db.queryOne(
                'SELECT COUNT(*) as total_sessions, AVG(duration_minutes) as avg_duration, SUM(messages_sent) as total_messages FROM session_analytics WHERE room_id = ? AND session_end IS NOT NULL',
                [roomId]
            );
        }
    },
    async testConnection() {
        try {
            await pool.execute('SELECT 1');
            console.log('✅ Database connected successfully');
            return true;
        } catch (error) {
            console.error('❌ Database connection failed:', error.message);
            return false;
        }
    },

    // Close connection
    async close() {
        await pool.end();
    }
};

module.exports = db;