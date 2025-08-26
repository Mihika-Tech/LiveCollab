// server/middleware/roomAuth.js
const db = require('../config/database');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Verify JWT token middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Check room access middleware
const checkRoomAccess = async (req, res, next) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        
        const room = await db.rooms.findById(roomId);
        if (!room) {
            return res.status(404).json({ message: 'Room not found' });
        }

        // Check if user is already in room
        const userRole = await db.roomSecurity.getUserRole(roomId, userId);
        req.userRole = userRole;
        
        // If room is private and user is not already in room
        if (room.is_private && !userRole) {
            const { password } = req.body;
            const isValid = await db.rooms.verifyPassword(roomId, password);
            
            if (!isValid) {
                return res.status(403).json({ message: 'Invalid room password' });
            }
        }

        // Check participant limit
        const currentUsers = await db.roomUsers.getRoomUsers(roomId);
        if (currentUsers.length >= room.max_participants && !userRole) {
            return res.status(403).json({ message: 'Room is full' });
        }

        req.room = room;
        next();
    } catch (error) {
        console.error('Room access check error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

// Check if user has permission to perform action
const requirePermission = (action) => {
    return async (req, res, next) => {
        try {
            const { roomId } = req.params;
            const userId = req.user.id;
            
            const canPerform = await db.roomSecurity.canUserPerformAction(roomId, userId, action);
            
            if (!canPerform) {
                return res.status(403).json({ message: 'Insufficient permissions' });
            }
            
            next();
        } catch (error) {
            console.error('Permission check error:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    };
};

module.exports = {
    authenticateToken,
    checkRoomAccess,
    requirePermission
};