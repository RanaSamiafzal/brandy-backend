import { Server } from "socket.io";
import User from "../modules/user/user.model.js";

const initializeSocket = (httpServer, app) => {
    const io = new Server(httpServer, {
        cors: {
            origin: ["http://localhost:5173", "http://localhost:3000", process.env.CORS_ORIGIN],
            credentials: true
        }
    });

    app.set('socketio', io);

    const onlineUsers = new Map(); // socketId -> userId
    const disconnectTimeouts = new Map(); // userId -> timeoutId

    io.on("connection", (socket) => {
        console.log("Connected to socket.io", socket.id);

        socket.on("setup", async (userData) => {
            if (!userData || !userData._id) return;
            const userId = userData._id;
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
                    io.emit("user_status_changed", { userId, status: "active", lastActive: new Date() });
                } else if (user && user.manualOffline) {
                    io.emit("user_status_changed", { userId, status: "offline", lastActive: user.lastActive });
                }
            } catch (error) {
                console.error("Error in socket setup:", error);
            }

            socket.emit("connected");
        });

        socket.on("join chat", (room) => {
            socket.join(room);
            console.log("User Joined Room: " + room);
        });

        socket.on("typing", (room) => socket.in(room).emit("typing", room));
        socket.on("stop typing", (room) => socket.in(room).emit("stop typing", room));

        socket.on("new message", (newMessageRecieved) => {
            const chat = newMessageRecieved.conversationId;
            if (!chat) return console.log("chat not defined for message");

            // 1. Emit to the conversation room (for the active chat window)
            socket.in(chat).emit("message recieved", newMessageRecieved);

            // 2. Emit to individual participant rooms (for sidebar updates)
            if (newMessageRecieved.participants) {
                newMessageRecieved.participants.forEach(participantId => {
                    const pId = typeof participantId === 'object' ? participantId._id : participantId;
                    if (String(pId) !== String(newMessageRecieved.sender._id)) {
                        socket.in(String(pId)).emit("message recieved", newMessageRecieved);
                    }
                });
            }
        });

        socket.on("message updated", (updatedMessage) => {
            const chat = updatedMessage.conversationId;
            if (!chat) return;

            // Broadcast the update to the conversation room
            socket.in(chat).emit("message updated", updatedMessage);
            
            // Also notify individual participant rooms for sidebars/notifications if needed
            if (updatedMessage.participants) {
                updatedMessage.participants.forEach(participantId => {
                    const pId = typeof participantId === 'object' ? participantId._id : participantId;
                    if (String(pId) !== String(updatedMessage.sender?._id || updatedMessage.sender)) {
                        socket.in(String(pId)).emit("message updated", updatedMessage);
                    }
                });
            }
        });

        socket.on("message deleted", ({ messageId, conversationId, participants }) => {
            if (!conversationId) return;

            // Broadcast deletion to the conversation room
            socket.in(conversationId).emit("message deleted", { messageId, conversationId });

            // Notify participants individual rooms
            if (participants) {
                participants.forEach(participantId => {
                    const pId = typeof participantId === 'object' ? participantId._id : participantId;
                    socket.in(pId).emit("message deleted", { messageId, conversationId });
                });
            }
        });

        socket.on("mark as read", ({ conversationId, userId }) => {
            if (!conversationId) return;
            socket.in(conversationId).emit("messages read", { conversationId, readBy: userId });
        });

        socket.on("disconnect", async () => {
            console.log("USER DISCONNECTED", socket.id);
            const userId = onlineUsers.get(socket.id);

            if (userId) {
                onlineUsers.delete(socket.id);

                // Check if user still has other active tabs
                let hasOtherSockets = false;
                for (let [sId, uId] of onlineUsers.entries()) {
                    if (uId === userId) {
                        hasOtherSockets = true;
                        break;
                    }
                }

                if (!hasOtherSockets) {
                    // Add a grace period
                    const timeoutId = setTimeout(async () => {
                        try {
                            const user = await User.findById(userId);
                            if (user) {
                                const lastActiveTime = new Date();
                                await User.findByIdAndUpdate(userId, { status: "offline", lastActive: lastActiveTime });
                                io.emit("user_status_changed", { userId, status: "offline", lastActive: lastActiveTime });
                            }
                        } catch (error) {
                            console.error("Error in socket disconnect timeout:", error);
                        }
                        disconnectTimeouts.delete(userId);
                    }, 3000);

                    disconnectTimeouts.set(userId, timeoutId);
                }
            }
        });
    });

    return io;
};

export default initializeSocket;
