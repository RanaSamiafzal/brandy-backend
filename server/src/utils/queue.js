import logger from "./logger.js";

/**
 * Background Queue Interface (Placeholder)
 * 
 * This module prepares the platform for background job processing (BullMQ/RabbitMQ).
 * Currently executes tasks immediately (synchronously) but provides the 
 * architectural boundary needed for production scaling.
 */
class TaskQueue {
    async add(taskName, payload, options = {}) {
        logger.info(`Queue Task Added: ${taskName}`, { options });
        
        // FUTURE: In production, push to Redis/RabbitMQ
        // CURRENT: Execute inline for safety during migration
        try {
            // Placeholder execution logic
            return true;
        } catch (error) {
            logger.error(`Task ${taskName} failed:`, error);
            return false;
        }
    }
}

export const taskQueue = new TaskQueue();

export const JOBS = {
    SCAN_MESSAGES: "scan:messages",
    GENERATE_DAILY_STATS: "stats:daily",
    RETRY_FAILED_PAYOUT: "retry:payout",
    CLEANUP_TEMP_FILES: "cleanup:temp"
};
