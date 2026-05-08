let io;

export const socketManager = {
    init: (ioInstance) => {
        io = ioInstance;
    },
    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized!");
        }
        return io;
    },
    emitToUser: (userId, event, data) => {
        if (io) {
            io.to(userId.toString()).emit(event, data);
        }
    },
    emitToUsers: (userIds, event, data) => {
        if (io && Array.isArray(userIds)) {
            userIds.forEach(id => io.to(id.toString()).emit(event, data));
        }
    },
    emitToRoom: (room, event, data) => {
        if (io) {
            io.to(room).emit(event, data);
        }
    },
    broadcast: (event, data) => {
        if (io) {
            io.emit(event, data);
        }
    }
};
