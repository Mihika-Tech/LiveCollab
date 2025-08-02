const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./config/database");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:5173", // frontend
        methods: ["GET", "POST"]
    }
});

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";

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
app.post("/api/auth/signup", async (req, res) => {
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
app.post("/api/auth/login", async (req, res) => {
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
    
    socket.on("joinRoom", async (roomId) => {
        try {
            // Create room if it doesn't exist
            const roomExists = await db.rooms.exists(roomId);
            if (!roomExists) {
                await db.rooms.create(roomId, `Room ${roomId}`, `Auto-created room`, socket.userId);
                // Initialize room metrics
                await db.query(
                    'INSERT IGNORE INTO room_metrics (room_id) VALUES (?)',
                    [roomId]
                );
            }

            // Add user to room
            await db.roomUsers.addUser(roomId, socket.userId, socket.userName, socket.id);
            socket.join(roomId);
            
            console.log(`${socket.userName} joined room ${roomId}`);
            
            // Analytics: Log user joined event
            await db.analytics.logEvent(roomId, 'user_joined', socket.userId, socket.userName);
            await db.analytics.startSession(roomId, socket.userId, socket.userName);
            
            // Update room metrics
            const currentUsers = await db.roomUsers.getRoomUsers(roomId);
            await db.analytics.updateRoomMetrics(roomId, {
                current_users: currentUsers.length,
                peak_users: currentUsers.length // Will be updated if it's higher
            });
            
            // Send empty message history for now (to avoid the SQL error)
            socket.emit("messageHistory", []);
            
            // Send current users list to the newly joined user
            socket.emit("roomUsers", currentUsers);
            
            // Send room analytics to the user
            const metrics = await db.analytics.getRoomMetrics(roomId);
            socket.emit("roomMetrics", metrics);
            
            // Notify others in the room that someone joined
            socket.to(roomId).emit("userJoined", {
                message: `${socket.userName} joined the room`,
                userId: socket.userId,
                userName: socket.userName,
                users: currentUsers
            });
            
            // Send updated metrics to all users in the room
            io.to(roomId).emit("metricsUpdate", { currentUsers: currentUsers.length });
            
        } catch (error) {
            console.error("Join room error:", error);
            socket.emit("error", { message: "Failed to join room" });
        }
    });

    socket.on("sendMessage", async ({roomId, message}) => {
        try {
            // Save message to database
            await db.messages.create(roomId, socket.userId, socket.userName, message);
            
            // Analytics: Log message sent event
            await db.analytics.logEvent(roomId, 'message_sent', socket.userId, socket.userName, { messageLength: message.length });
            await db.analytics.incrementMessageCount(roomId, socket.userId);
            
            // Update room metrics
            const metrics = await db.analytics.getRoomMetrics(roomId);
            await db.analytics.updateRoomMetrics(roomId, {
                total_messages: (metrics?.total_messages || 0) + 1
            });
            
            // Update user activity
            await db.roomUsers.updateActivity(roomId, socket.userId);

            // Create message object
            const messageData = {
                id: socket.userId,
                name: socket.userName,
                message,
                timestamp: new Date()
            };
            
            // Send to ALL users in the room
            io.to(roomId).emit("receiveMessage", messageData);
            
            // Send updated metrics to all users
            io.to(roomId).emit("metricsUpdate", { 
                totalMessages: (metrics?.total_messages || 0) + 1 
            });
            
        } catch (error) {
            console.error("Send message error:", error);
            socket.emit("error", { message: "Failed to send message" });
        }
    });

    socket.on("startBroadcast", async (roomId) => {
        try {
            // Mark user as broadcaster in the room
            await db.query(
                'UPDATE room_users SET is_broadcaster = TRUE WHERE room_id = ? AND user_id = ?',
                [roomId, socket.userId]
            );
            
            // Notify all users in the room that broadcast started
            socket.to(roomId).emit("broadcastStarted", {
                broadcasterId: socket.userId,
                broadcasterName: socket.userName,
                broadcasterSocketId: socket.id  // Add socket ID for WebRTC
            });
            
            console.log(`${socket.userName} started broadcasting in room ${roomId}`);
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