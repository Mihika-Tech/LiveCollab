const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./config/database");
const { authenticateToken, checkRoomAccess, requirePermission } = require('./middleware/roomAuth');
const rateLimit = require("express-rate-limit");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173", // frontend
        methods: ["GET", "POST"]
    }
});

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET;

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per window
    message: 'Too many attempts, please try again later'
});

const roomLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: 'Too many rooms created, please try again later'
});

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to generate JWT token
const generateToken = (user) => {
    return jwt.sign(
        { id: user.id, name: user.name, email: user.email },
        JWT_SECRET,
        { expiresIn: "7d" }
    );
};

// Helper function to verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Routes
app.get("/", (req, res) => {
    res.send("Live Event Server is running with MySQL!");
});

// Health check endpoint
app.get("/health", async (req, res) => {
    const dbConnected = await db.testConnection();
    res.json({
        server: "running",
        database: dbConnected ? "connected" : "disconnected",
        timestamp: new Date().toISOString()
    });
});

// Signup endpoint
app.post("/api/auth/signup", authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validate input
        if (!name || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        // Check if user already exists
        const existingUser = await db.users.findByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: "User with this email already exists" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user
        const userId = await db.users.create(name, email, hashedPassword);

        // Generate token
        const token = generateToken({
            id: userId,
            name,
            email
        });

        res.status(201).json({
            token,
            user: {
                id: userId,
                name,
                email
            }
        });
    } catch (error) {
        console.error("Signup error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Login endpoint
app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find user
        const user = await db.users.findByEmail(email);
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid email or password" });
        }

        // Update last active
        await db.users.updateLastActive(user.id);

        // Generate token
        const token = generateToken({
            id: user.id,
            name: user.name,
            email: user.email
        });

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

app.post("/api/rooms/create", authenticateToken, roomLimiter, async (req, res) => {
    try {
        const { roomId, name, description, isPrivate, password, maxParticipants } = req.body;
        const userId = req.user.id;
        
        // Check if room already exists
        if (await db.rooms.exists(roomId)) {
            return res.status(400).json({ message: "Room ID already exists" });
        }
        
        // Hash password if private room
        let hashedPassword = null;
        if (isPrivate && password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }
        
        // Create room
        await db.rooms.create(roomId, name, description, userId, isPrivate, hashedPassword);
        
        // Set max participants if provided
        if (maxParticipants) {
            await db.query(
                'UPDATE rooms SET max_participants = ? WHERE id = ?',
                [maxParticipants, roomId]
            );
        }
        
        res.json({ 
            success: true, 
            roomId,
            message: "Room created successfully" 
        });
    } catch (error) {
        console.error("Create room error:", error);
        res.status(500).json({ message: "Failed to create room" });
    }
});

// Verify room access (for joining private rooms)
app.post("/api/rooms/:roomId/verify-access", authenticateToken, async (req, res) => {
    try {
        const { roomId } = req.params;
        const { password } = req.body;
        
        const room = await db.rooms.findById(roomId);
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        
        if (room.is_private) {
            const isValid = await db.rooms.verifyPassword(roomId, password);
            if (!isValid) {
                return res.status(403).json({ message: "Invalid password" });
            }
        }
        
        res.json({ 
            access: true,
            room: {
                id: room.id,
                name: room.name,
                description: room.description
            }
        });
    } catch (error) {
        console.error("Verify access error:", error);
        res.status(500).json({ message: "Verification failed" });
    }
});

// Get room settings (for room owners/moderators)
app.get("/api/rooms/:roomId/settings", authenticateToken, checkRoomAccess, async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user.id;
        
        // Check if user is owner or moderator
        const role = await db.roomSecurity.getUserRole(roomId, userId);
        if (!['owner', 'moderator'].includes(role)) {
            return res.status(403).json({ message: "Access denied" });
        }
        
        const room = await db.rooms.findById(roomId);
        const customization = await db.roomCustomization.get(roomId);
        const permissions = {
            owner: await db.roomSecurity.getPermissions(roomId, 'owner'),
            moderator: await db.roomSecurity.getPermissions(roomId, 'moderator'),
            member: await db.roomSecurity.getPermissions(roomId, 'member')
        };
        
        res.json({
            room: {
                ...room,
                password: undefined // Don't send hashed password
            },
            customization,
            permissions,
            userRole: role
        });
    } catch (error) {
        console.error("Get settings error:", error);
        res.status(500).json({ message: "Failed to get settings" });
    }
});

// Update room security settings
app.put("/api/rooms/:roomId/security", 
    authenticateToken, 
    checkRoomAccess, 
    requirePermission('can_manage_room'), 
    async (req, res) => {
    try {
        const { roomId } = req.params;
        const { isPrivate, password, maxParticipants, permissions } = req.body;
        
        // Update room settings
        await db.rooms.updateSettings(roomId, { isPrivate, password, maxParticipants });
        
        // Update permissions if provided
        if (permissions) {
            for (const [role, perms] of Object.entries(permissions)) {
                await db.roomSecurity.updatePermissions(roomId, role, perms);
            }
        }
        
        res.json({ success: true, message: "Security settings updated" });
    } catch (error) {
        console.error("Update security error:", error);
        res.status(500).json({ message: "Failed to update security settings" });
    }
});

// Update room customization
app.put("/api/rooms/:roomId/customization", 
    authenticateToken, 
    checkRoomAccess, 
    requirePermission('can_manage_room'), 
    async (req, res) => {
    try {
        const { roomId } = req.params;
        const customizations = req.body;
        
        // Validate color formats
        const colorFields = ['primaryColor', 'backgroundColor', 'textColor', 'accentColor'];
        for (const field of colorFields) {
            if (customizations[field] && !/^#[0-9A-F]{6}$/i.test(customizations[field])) {
                return res.status(400).json({ message: `Invalid color format for ${field}` });
            }
        }
        
        // Convert camelCase to snake_case for database
        const dbCustomizations = {};
        if (customizations.primaryColor) dbCustomizations.primary_color = customizations.primaryColor;
        if (customizations.backgroundColor) dbCustomizations.background_color = customizations.backgroundColor;
        if (customizations.textColor) dbCustomizations.text_color = customizations.textColor;
        if (customizations.accentColor) dbCustomizations.accent_color = customizations.accentColor;
        if (customizations.logoUrl !== undefined) dbCustomizations.logo_url = customizations.logoUrl;
        if (customizations.welcomeMessage !== undefined) dbCustomizations.welcome_message = customizations.welcomeMessage;
        
        // Feature toggles
        const booleanFields = ['enableChat', 'enableVideo', 'enableScreenShare', 'enableRecordings', 'enableAnalytics', 'autoRecord'];
        for (const field of booleanFields) {
            if (customizations[field] !== undefined) {
                dbCustomizations[field.replace(/([A-Z])/g, '_$1').toLowerCase()] = customizations[field];
            }
        }
        
        await db.roomCustomization.update(roomId, dbCustomizations);
        
        // Emit customization update to all users in room
        io.to(roomId).emit("customizationUpdated", customizations);
        
        res.json({ success: true, message: "Customization updated" });
    } catch (error) {
        console.error("Update customization error:", error);
        res.status(500).json({ message: "Failed to update customization" });
    }
});

// Get room theme (public endpoint for room participants)
app.get("/api/rooms/:roomId/theme", async (req, res) => {
    try {
        const { roomId } = req.params;
        const theme = await db.roomCustomization.getTheme(roomId);
        res.json(theme || {});
    } catch (error) {
        console.error("Get theme error:", error);
        res.status(500).json({ message: "Failed to get theme" });
    }
});

// Update user role
app.put("/api/rooms/:roomId/users/:userId/role", 
    authenticateToken, 
    checkRoomAccess, 
    requirePermission('can_manage_room'), 
    async (req, res) => {
    try {
        const { roomId, userId: targetUserId } = req.params;
        const { role } = req.body;
        const requestingUserId = req.user.id;
        
        // Can't change own role
        if (requestingUserId === parseInt(targetUserId)) {
            return res.status(400).json({ message: "Cannot change your own role" });
        }
        
        // Only owner can assign owner role
        const requestingUserRole = await db.roomSecurity.getUserRole(roomId, requestingUserId);
        if (role === 'owner' && requestingUserRole !== 'owner') {
            return res.status(403).json({ message: "Only room owner can transfer ownership" });
        }
        
        await db.roomSecurity.updateUserRole(roomId, targetUserId, role);
        
        // Notify user of role change
        io.to(roomId).emit("userRoleChanged", {
            userId: targetUserId,
            newRole: role
        });
        
        res.json({ success: true, message: "User role updated" });
    } catch (error) {
        console.error("Update role error:", error);
        res.status(500).json({ message: "Failed to update user role" });
    }
});

// Kick user from room
app.delete("/api/rooms/:roomId/users/:userId", 
    authenticateToken, 
    checkRoomAccess, 
    requirePermission('can_kick_users'), 
    async (req, res) => {
    try {
        const { roomId, userId: targetUserId } = req.params;
        
        await db.roomUsers.removeUser(roomId, targetUserId);
        
        // Find user's socket and disconnect them
        const sockets = await io.in(roomId).fetchSockets();
        for (const socket of sockets) {
            if (socket.userId === parseInt(targetUserId)) {
                socket.emit("kicked", { message: "You have been removed from the room" });
                socket.disconnect();
            }
        }
        
        res.json({ success: true, message: "User removed from room" });
    } catch (error) {
        console.error("Kick user error:", error);
        res.status(500).json({ message: "Failed to remove user" });
    }
});

// Get room info endpoint
app.get("/api/rooms/:roomId", async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await db.rooms.findById(roomId);
        
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }

        const users = await db.roomUsers.getRoomUsers(roomId);
        const messageCount = await db.query(
            'SELECT COUNT(*) as count FROM messages WHERE room_id = ?',
            [roomId]
        );

        res.json({
            room,
            userCount: users.length,
            messageCount: messageCount[0].count
        });
    } catch (error) {
        console.error("Room info error:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// Get room analytics endpoint
app.get("/api/analytics/:roomId", async (req, res) => {
    try {
        const { roomId } = req.params;
        
        // Get current metrics
        const metrics = await db.analytics.getRoomMetrics(roomId);
        
        // Get recent activity (last 24 hours)
        const recentActivity = await db.analytics.getRecentActivity(roomId, 24);
        
        // Get session stats
        const sessionStats = await db.analytics.getSessionStats(roomId);
        
        // Get hourly message counts for chart
        const hourlyMessages = await db.query(
            'SELECT DATE_FORMAT(created_at, "%H:00") as hour, COUNT(*) as count FROM room_analytics WHERE room_id = ? AND event_type = "message_sent" AND created_at >= NOW() - INTERVAL 24 HOUR GROUP BY hour ORDER BY hour',
            [roomId]
        );
        
        // Get user activity
        const userActivity = await db.query(
            'SELECT user_name, COUNT(*) as message_count FROM room_analytics WHERE room_id = ? AND event_type = "message_sent" AND created_at >= NOW() - INTERVAL 24 HOUR GROUP BY user_name ORDER BY message_count DESC LIMIT 10',
            [roomId]
        );
        
        res.json({
            metrics: metrics || {},
            recentActivity,
            sessionStats: sessionStats || {},
            hourlyMessages,
            userActivity
        });
    } catch (error) {
        console.error("Analytics error:", error);
        res.status(500).json({ message: "Failed to fetch analytics" });
    }
});

// Export analytics data
app.get("/api/analytics/:roomId/export", async (req, res) => {
    try {
        const { roomId } = req.params;
        const { format = 'json' } = req.query;
        
        const analytics = await db.query(
            'SELECT * FROM room_analytics WHERE room_id = ? ORDER BY created_at DESC',
            [roomId]
        );
        
        if (format === 'csv') {
            const csv = analytics.map(row => 
                `${row.created_at},${row.event_type},${row.user_name},${row.data || ''}`
            ).join('\n');
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="room-${roomId}-analytics.csv"`);
            res.send(`timestamp,event_type,user_name,data\n${csv}`);
        } else {
            res.json(analytics);
        }
    } catch (error) {
        console.error("Export error:", error);
        res.status(500).json({ message: "Failed to export analytics" });
    }
});
io.use(async (socket, next) => {
    try {
        // Get token from handshake auth
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error("Authentication error"));
        }

        // Verify token
        const decoded = verifyToken(token);
        if (!decoded) {
            return next(new Error("Authentication error"));
        }

        // Verify user exists in database
        const user = await db.users.findById(decoded.id);
        if (!user) {
            return next(new Error("User not found"));
        }

        // Add user info to socket
        socket.userId = user.id;
        socket.userName = user.name;
        socket.userEmail = user.email;
        
        next();
    } catch (error) {
        console.error("Socket authentication error:", error);
        next(new Error("Authentication error"));
    }
});

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userName} (${socket.userId})`);
    
    socket.on("joinRoom", async (roomId, password = null) => {
    try {
        // Check room exists and verify password if needed
        const room = await db.rooms.findById(roomId);
        if (!room) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const retryRoom = await db.rooms.findById(roomId);
            
            if (!retryRoom) {
                socket.emit("error", { message: "Room not found" });
                return;
            }
        }

        const finalRoom = room || await db.rooms.findById(roomId);
        
        // For private rooms, check password
        if (finalRoom.is_private && !password) {
            socket.emit("error", { message: "Invalid room password" });
            return;
        }
        
        if (finalRoom.is_private && password) {
            const isValid = await db.rooms.verifyPassword(roomId, password);
            if (!isValid) {
                socket.emit("error", { message: "Invalid room password" });
                return;
            }
        }
        
        // Check participant limit
        const currentUsers = await db.roomUsers.getRoomUsers(roomId);
        const existingUser = currentUsers.find(u => u.id === socket.userId);
        
        if (!existingUser && currentUsers.length >= room.max_participants) {
            socket.emit("error", { message: "Room is full" });
            return;
        }
        
        // Add user to room with role
        const isCreator = room.created_by === socket.userId;
        const role = existingUser ? existingUser.role : (isCreator ? 'owner' : 'member');
        
        await db.roomUsers.addUser(roomId, socket.userId, socket.userName, socket.id);
        if (!existingUser) {
            await db.roomSecurity.updateUserRole(roomId, socket.userId, role);
        }
        
        socket.join(roomId);
        socket.roomId = roomId; // Store for later use
        
        // Get user permissions
        const permissions = await db.roomSecurity.getPermissions(roomId, role);
        
        // Get room customization
        const customization = await db.roomCustomization.get(roomId);
        
        // Send room info to joined user
        socket.emit("roomJoined", {
            room: {
                id: room.id,
                name: room.name,
                description: room.description,
                isPrivate: room.is_private
            },
            role,
            permissions,
            customization
        });
        
        // Rest of your existing joinRoom logic...
        console.log(`${socket.userName} joined room ${roomId} as ${role}`);
        
        // Send message history
        const messages = await db.messages.getLatest(roomId);
        socket.emit("messageHistory", messages);
        
        // Update and send users list with roles
        const updatedUsers = await db.query(
            `SELECT u.user_id as id, u.user_name as name, u.role, u.joined_at 
             FROM room_users u 
             WHERE u.room_id = ? 
             ORDER BY u.joined_at ASC`,
            [roomId]
        );
        
        socket.emit("roomUsers", updatedUsers);
        
        // Notify others
        socket.to(roomId).emit("userJoined", {
            message: `${socket.userName} joined the room`,
            userId: socket.userId,
            userName: socket.userName,
            role: role,
            users: updatedUsers
        });
        
        // Analytics and metrics...
        await db.analytics.logEvent(roomId, 'user_joined', socket.userId, socket.userName);
        await db.analytics.startSession(roomId, socket.userId, socket.userName);
        
    } catch (error) {
        console.error("Join room error:", error);
        socket.emit("error", { message: "Failed to join room" });
    }
});

    socket.on("sendMessage", async ({roomId, message}) => {
    try {
        // Check if chat is enabled
        const customization = await db.roomCustomization.get(roomId);
        if (!customization.enable_chat) {
            socket.emit("error", { message: "Chat is disabled in this room" });
            return;
        }
        
        // Rest of your existing sendMessage logic...
        await db.messages.create(roomId, socket.userId, socket.userName, message);
        
        const messageData = {
            id: socket.userId,
            name: socket.userName,
            message,
            timestamp: new Date()
        };
        
        io.to(roomId).emit("receiveMessage", messageData);
        
    } catch (error) {
        console.error("Send message error:", error);
        socket.emit("error", { message: "Failed to send message" });
    }
});

    socket.on("startBroadcast", async (roomId) => {
    try {
        // Check if video is enabled and user has permission
        const customization = await db.roomCustomization.get(roomId);
        if (!customization.enable_video) {
            socket.emit("error", { message: "Video is disabled in this room" });
            return;
        }
        
        const canBroadcast = await db.roomSecurity.canUserPerformAction(roomId, socket.userId, 'can_broadcast');
        if (!canBroadcast) {
            socket.emit("error", { message: "You don't have permission to broadcast" });
            return;
        }
        
        // Rest of your existing broadcast logic...
        await db.query(
            'UPDATE room_users SET is_broadcaster = TRUE WHERE room_id = ? AND user_id = ?',
            [roomId, socket.userId]
        );
        
        socket.to(roomId).emit("broadcastStarted", {
            broadcasterId: socket.userId,
            broadcasterName: socket.userName,
            broadcasterSocketId: socket.id
        });
        
    } catch (error) {
        console.error("Start broadcast error:", error);
        socket.emit("error", { message: "Failed to start broadcast" });
    }
});

    socket.on("stopBroadcast", async (roomId) => {
        try {
            // Remove broadcaster status
            await db.query(
                'UPDATE room_users SET is_broadcaster = FALSE WHERE room_id = ? AND user_id = ?',
                [roomId, socket.userId]
            );
            
            // Notify all users that broadcast stopped
            io.to(roomId).emit("broadcastStopped", {
                broadcasterId: socket.userId,
                broadcasterName: socket.userName
            });
            
            console.log(`${socket.userName} stopped broadcasting in room ${roomId}`);
        } catch (error) {
            console.error("Stop broadcast error:", error);
            socket.emit("error", { message: "Failed to stop broadcast" });
        }
    });

    // WebRTC signaling events
    socket.on("offer", (data) => {
        socket.to(data.target).emit("offer", {
            offer: data.offer,
            sender: socket.id
        });
    });

    socket.on("answer", (data) => {
        socket.to(data.target).emit("answer", {
            answer: data.answer,
            sender: socket.id
        });
    });

    socket.on("ice-candidate", (data) => {
        socket.to(data.target).emit("ice-candidate", {
            candidate: data.candidate,
            sender: socket.id
        });
    });

    socket.on("requestOffer", (data) => {
        // Forward the request to the target (broadcaster)
        console.log(`${socket.userName} requesting offer from broadcaster with socket ID: ${data.target}`);
        socket.to(data.target).emit("requestOffer", {
            requester: socket.id,
            requesterName: socket.userName
        });
        console.log(`Request forwarded to ${data.target}`);
    });

    // When broadcaster receives offer request, they send an offer
    socket.on("sendOffer", (data) => {
        console.log(`Sending offer from ${socket.userName} to ${data.target}`);
        socket.to(data.target).emit("receiveOffer", {
            offer: data.offer,
            sender: socket.id,
            senderName: socket.userName
        });
    });

    // When viewer sends answer back to broadcaster
    socket.on("sendAnswer", (data) => {
        console.log(`Sending answer from ${socket.userName} to ${data.target}`);
        socket.to(data.target).emit("receiveAnswer", {
            answer: data.answer,
            sender: socket.id,
            senderName: socket.userName
        });
    });

    socket.on("disconnect", async () => {
        try {
            console.log(`User disconnected: ${socket.userName}`);
            
            // Remove user from all rooms they were in
            const removedUser = await db.roomUsers.removeBySocketId(socket.id);
            
            if (removedUser) {
                const roomUsers = await db.roomUsers.getRoomUsers(removedUser.room_id);
                
                // Notify others in the room that someone left
                socket.to(removedUser.room_id).emit("userLeft", {
                    message: `${removedUser.user_name} left the room`,
                    userId: removedUser.user_id,
                    userName: removedUser.user_name,
                    users: roomUsers
                });
            }
        } catch (error) {
            console.error("Disconnect error:", error);
        }
    });
});

// Start server
const PORT = process.env.PORT || 4000;

// Test database connection before starting server
db.testConnection().then((connected) => {
    if (connected) {
        httpServer.listen(PORT, () => {
            console.log(`🚀 Server running at http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/health`);
        });
    } else {
        console.error("❌ Failed to connect to database. Please check your MySQL configuration.");
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🔄 Shutting down gracefully...');
    await db.close();
    process.exit(0);
});