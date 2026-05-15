import AiMemory from "./aiMemory.model.js";

/**
 * AI Memory Repository
 * Handles direct database interactions for AI context.
 */
class MemoryRepository {
    async findByUserId(userId) {
        return await AiMemory.findOne({ userId });
    }

    async create(userId) {
        return await AiMemory.create({ userId });
    }

    async update(userId, updateData) {
        return await AiMemory.findOneAndUpdate(
            { userId },
            { $set: { ...updateData, lastUpdated: new Date() } },
            { new: true, upsert: true }
        );
    }

    async appendToHistory(userId, category, data) {
        const field = `history.${category}`;
        return await AiMemory.findOneAndUpdate(
            { userId },
            { 
                $push: { [field]: data },
                $set: { lastUpdated: new Date() }
            },
            { new: true, upsert: true }
        );
    }

    async addInteraction(userId, summary) {
        return await AiMemory.findOneAndUpdate(
            { userId },
            { 
                $push: { 
                    interactions: { 
                        $each: [summary],
                        $slice: -50 // Keep only last 50 interactions to prevent document bloating
                    } 
                },
                $set: { lastUpdated: new Date() }
            },
            { new: true, upsert: true }
        );
    }

    async deleteOlderThan(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        // This is a complex query if we want to prune arrays inside documents.
        // For simple TTL, we'd delete the whole doc, but we want a "rolling" 30-day window.
        // We'll implement a pruning strategy in the service.
        return date;
    }
}

export const memoryRepository = new MemoryRepository();
