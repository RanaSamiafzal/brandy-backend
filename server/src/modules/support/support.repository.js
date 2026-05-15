import SupportTicket from "./support.model.js";

class SupportRepository {
    async create(ticketData) {
        return await SupportTicket.create(ticketData);
    }

    async findById(ticketId) {
        return await SupportTicket.findOne({ ticketId }).populate("userId", "fullname email role");
    }

    async findByUserId(userId, status) {
        const query = { userId };
        if (status) query.status = status;
        return await SupportTicket.find(query).sort({ updatedAt: -1 });
    }

    async updateStatus(ticketId, status) {
        return await SupportTicket.findOneAndUpdate(
            { ticketId },
            { $set: { status, lastActivityAt: new Date() } },
            { new: true }
        );
    }

    async addMessage(ticketId, senderId, text) {
        return await SupportTicket.findOneAndUpdate(
            { ticketId },
            { 
                $push: { messages: { sender: senderId, text, timestamp: new Date() } },
                $set: { lastActivityAt: new Date() }
            },
            { new: true }
        );
    }

    async checkDuplicate(userId, type) {
        // Check for an OPEN ticket of same type created in last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        return await SupportTicket.findOne({
            userId,
            type,
            status: "OPEN",
            createdAt: { $gte: oneHourAgo }
        });
    }

    async getAllTickets(filters = {}) {
        return await SupportTicket.find(filters)
            .populate("userId", "fullname email")
            .sort({ createdAt: -1 });
    }
}

export const supportRepository = new SupportRepository();
