require('dotenv').config();
const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'livecollab',
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
        async create(roomId, name, description, createdBy) {
            await db.query(
                'INSERT INTO rooms (id, name, description, created_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP',
                [roomId, name, description, createdBy]
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
            return await db.query(
                'SELECT user_id as id, user_name as name, message, created_at as timestamp FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?',
                [roomId, parseInt(limit)]
            );
        },

        async getLatest(roomId, limit = 50) {
            const messages = await this.getHistory(roomId, parseInt(limit));
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

    // Test connection
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