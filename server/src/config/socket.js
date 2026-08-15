import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import User from "../modules/user/user.model.js";
import { socketManager } from "./socketManager.js";
import { canJoinRoom, getAuthorizedConversation, getAuthorizedMessage } from "./socketAcl.js";

const initializeSocket = (httpServer, app) => {
    const allowedSocketOrigins = [
        "http://localhost:5173", 
        "http://localhost:3000", 
        "http://127.0.0.1:5173", 
        "http://127.0.0.1:3000", 
        process.env.CORS_ORIGIN
    ].filter(Boolean);

    const io = new Server(httpServer, {
        cors: {
            origin: function (origin, callback) {
                if (!origin || allowedSocketOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true
        },
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
        connectTimeout: 45000,
        allowEIO3: true
    });

    socketManager.init(io);

    // Socket.io Authentication Middleware
    io.use((socket, next) => {
        try {
            // Check auth token or cookies
            const token = socket.handshake.auth?.token || 
                         socket.handshake.headers.cookie?.split('accessToken=')[1]?.split(';')[0];
            
            if (!token) {
                return next(new Error("Authentication error: No token provided"));
            }

            const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
            socket.userId = decoded._id;
            next();
        } catch (err) {
            console.error("Socket Auth Error:", err.message);
            next(new Error("Authentication error: Invalid token"));
        }
    });

    const onlineUsers = new Map(); // socketId -> userId
    const disconnectTimeouts = new Map(); // userId -> timeoutId

    io.on("connection", (socket) => {
        console.log("Connected to socket.io", socket.id, "User:", socket.userId);

        socket.on("setup", async () => {
            const userId = socket.userId;
            if (!userId) return;

            socket.join(userId);
            onlineUsers.set(socket.id, userId);

            // If there was a pending disconnect for this user, clear it
            if (disconnectTimeouts.has(userId)) {
                clearTimeout(disconnectTimeouts.get(userId));
                disconnectTimeouts.delete(userId);
            }

            // Check DB status to see if they were manually offline
            try {
                const user = await User.findById(userId);
                if (user && !user.manualOffline) {
                    await User.findByIdAndUpdate(userId, { status: "active", lastActive: new Date() });
                    socket.broadcast.emit("user_status_changed", { userId, status: "active", lastActive: new Date() });
                } else if (user && user.manualOffline) {
                    socket.broadcast.emit("user_status_changed", { userId, status: "offline", lastActive: user.lastActive });
                }
            } catch (error) {
                console.error("Error in socket setup:", error);
            }

            socket.emit("connected");
        });

        socket.on("join chat", async (room) => {
            try {
                const allowed = await canJoinRoom(socket.userId, room);
                if (!allowed) {
                    socket.emit("socket_error", { event: "join chat", message: "Not authorized for this room" });
                    return;
                }
                socket.join(String(room));
            } catch (error) {
                console.error("Error in join chat:", error);
            }
        });

        socket.on("typing", async (room) => {
            if (!(await canJoinRoom(socket.userId, room))) return;
            socket.in(String(room)).emit("typing", room);
        });
        socket.on("stop typing", async (room) => {
            if (!(await canJoinRoom(socket.userId, room))) return;
            socket.in(String(room)).emit("stop typing", room);
        });

        socket.on("new message", async (newMessageRecieved) => {
            try {
                const conversationId = newMessageRecieved?.conversationId?._id || newMessageRecieved?.conversationId;
                const conv = await getAuthorizedConversation(socket.userId, conversationId);
                if (!conv) {
                    socket.emit("socket_error", { event: "new message", message: "Not authorized" });
                    return;
                }

                const senderId = newMessageRecieved?.sender?._id || newMessageRecieved?.sender;
                if (senderId && String(senderId) !== String(socket.userId)) {
                    socket.emit("socket_error", { event: "new message", message: "Sender mismatch" });
                    return;
                }

                const safePayload = {
                    ...newMessageRecieved,
                    conversationId,
                    participants: conv.participants,
                };

                socket.in(String(conversationId)).emit("message recieved", safePayload);
                conv.participants.forEach((participantId) => {
                    if (String(participantId) !== String(socket.userId)) {
                        socket.in(String(participantId)).emit("message recieved", safePayload);
                    }
                });
            } catch (error) {
                console.error("Error in new message:", error);
            }
        });

        socket.on("message updated", async (updatedMessage) => {
            try {
                const conversationId = updatedMessage?.conversationId?._id || updatedMessage?.conversationId;
                const conv = await getAuthorizedConversation(socket.userId, conversationId);
                if (!conv) return;

                const safePayload = {
                    ...updatedMessage,
                    conversationId,
                    participants: conv.participants,
                };
                socket.in(String(conversationId)).emit("message updated", safePayload);
                conv.participants.forEach((participantId) => {
                    if (String(participantId) !== String(socket.userId)) {
                        socket.in(String(participantId)).emit("message updated", safePayload);
                    }
                });
            } catch (error) {
                console.error("Error in message updated:", error);
            }
        });

        socket.on("message deleted", async ({ messageId, conversationId }) => {
            try {
                const conv = await getAuthorizedConversation(socket.userId, conversationId);
                if (!conv) return;
                if (messageId) {
                    const msg = await getAuthorizedMessage(socket.userId, messageId, conversationId);
                    if (!msg) return;
                }

                socket.in(String(conversationId)).emit("message deleted", { messageId, conversationId });
                conv.participants.forEach((participantId) => {
                    socket.in(String(participantId)).emit("message deleted", { messageId, conversationId });
                });
            } catch (error) {
                console.error("Error in message deleted:", error);
            }
        });

        socket.on("mark as read", async ({ conversationId, userId }) => {
            try {
                const conv = await getAuthorizedConversation(socket.userId, conversationId);
                if (!conv) return;
                socket.in(String(conversationId)).emit("messages read", {
                    conversationId,
                    readBy: socket.userId,
                });
            } catch (error) {
                console.error("Error in mark as read:", error);
            }
        });

        socket.on("presence_ping", async () => {
            const userId = socket.userId;
            if (!userId) return;
            try {
                const user = await User.findById(userId).select("manualOffline");
                if (user && !user.manualOffline) {
                    await User.findByIdAndUpdate(userId, { lastActive: new Date() });
                }
            } catch (error) {
                console.error("Error in presence_ping:", error);
            }
        });

        socket.on("disconnect", async () => {
            console.log("SOCKET DISCONNECTED", socket.id);
            const userId = onlineUsers.get(socket.id);

            if (userId) {
                onlineUsers.delete(socket.id);

                // Count active sockets for this user
                let activeSocketsCount = 0;
                for (let [sId, uId] of onlineUsers.entries()) {
                    if (uId === userId) {
                        activeSocketsCount++;
                    }
                }

                if (activeSocketsCount === 0) {
                    // All tabs closed - Add a grace period
                    const timeoutId = setTimeout(async () => {
                        try {
                            const user = await User.findById(userId);
                            if (user) {
                                const lastActiveTime = new Date();
                                await User.findByIdAndUpdate(userId, { status: "offline", lastActive: lastActiveTime });
                                socket.broadcast.emit("user_status_changed", { userId, status: "offline", lastActive: lastActiveTime });
                            }
                        } catch (error) {
                            console.error("Error in socket disconnect timeout:", error);
                        }
                        disconnectTimeouts.delete(userId);
                    }, 5000);

                    disconnectTimeouts.set(userId, timeoutId);
                }
            }
        });
    });

    return io;
};

export default initializeSocket;
