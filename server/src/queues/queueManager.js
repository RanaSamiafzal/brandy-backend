import { Queue } from 'bullmq';
import { QUEUES } from '../events/constants.js';
import logger from '../utils/logger.js';
import { getSharedConnection } from '../config/redis.js';

const queues = {};

/**
 * Queue Manager
 * 
 * Centralizes queue creation and management.
 */
export const getQueue = (queueName) => {
    if (!queues[queueName]) {
        queues[queueName] = new Queue(queueName, {
            connection: getSharedConnection(),
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 1000,
                },
                removeOnComplete: true,
                removeOnFail: false,
            }
        });
        
        logger.info(`Initialized Queue: ${queueName}`);
    }
    return queues[queueName];
};

/**
 * Utility to add jobs easily
 */
export const addJob = async (queueName, jobName, data, options = {}) => {
    try {
        const queue = getQueue(queueName);
        const job = await queue.add(jobName, data, options);
        logger.debug(`Job added to ${queueName}: ${job.id}`);
        return job;
    } catch (error) {
        logger.error(`Failed to add job to ${queueName}:`, error);
        throw error;
    }
};

// Initialize all standard queues
export const initQueues = () => {
    Object.values(QUEUES).forEach(q => getQueue(q));
};

export const closeQueues = async () => {
    logger.info('Closing all queues...');
    await Promise.all(Object.values(queues).map(q => q.close()));
    logger.info('All queues closed.');
};
