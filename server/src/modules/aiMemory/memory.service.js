import { memoryRepository } from "./memory.repository.js";
import logger from "../../utils/logger.js";

/**
 * AI Memory Service
 * Orchestrates long-term context tracking and intelligence retrieval.
 */
class MemoryService {
    /**
     * Get or initialize memory for a user
     */
    async getUserContext(userId) {
        let memory = await memoryRepository.findByUserId(userId);
        if (!memory) {
            memory = await memoryRepository.create(userId);
        }
        return memory;
    }

    /**
     * Append a specific behavioral event to the user's AI memory
     * Categories: moderation, complaints, payouts, suspiciousActivity
     */
    async recordEvent(userId, category, data) {
        logger.info(`Recording AI Memory event for user ${userId} in category ${category}`);
        
        const adjustments = {
            payouts: 5,
            moderation: -10,
            suspiciousActivity: -20,
            complaints: -5
        };

        const trustChange = adjustments[category] || 0;
        
        // Import dynamically to avoid potential circular dependency with ModerationService
        const { moderationService } = await import("../moderation/moderation.service.js");
        await moderationService.adjustTrust(userId, 'TRUST_ADJUSTMENT', `AI Memory Update: ${category}`, trustChange);

        return await memoryRepository.appendToHistory(userId, category, data);
    }

    /**
     * Add a summary of a recent interaction
     */
    async addInteractionSummary(userId, summary) {
        return await memoryRepository.addInteraction(userId, summary);
    }

    /**
     * Generate a behavioral summary (Mocking AI summarization for now)
     * In a real scenario, this would call an LLM with the history as context.
     */
    async summarizeContext(userId) {
        const memory = await this.getUserContext(userId);
        const { history, trustScore, riskLevel } = memory;

        const totalEvents = 
            history.moderation.length + 
            history.complaints.length + 
            history.suspiciousActivity.length;

        let summary = `User has a trust score of ${trustScore}% (${riskLevel} risk). `;
        
        if (totalEvents === 0) {
            summary += "Clean history with no flagged incidents.";
        } else {
            summary += `Detected ${totalEvents} flagged events. `;
            if (history.moderation.length > 0) summary += `Recent moderation: ${history.moderation.slice(-1)[0].reason}. `;
        }

        await memoryRepository.update(userId, { aiSummary: summary });
        return summary;
    }

    /**
     * Cleanup: Prune history older than 30 days
     */
    async runPruningJob() {
        logger.info("Starting AI Memory Pruning Job (30-day rolling window)");
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // We'll perform a manual pull-filter-save for all memories that were updated
        // In production, this would be a bulk operation.
        // For now, we'll mark this as a strategy implementation.
        return { action: "prune_older_than_30_days", date: thirtyDaysAgo };
    }
}

export const memoryService = new MemoryService();
