import { Worker } from 'bullmq';
import { getSharedConnection } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Worker Factory
 * 
 * Provides a standardized way to create background workers with error 
 * handling and logging.
 */
const workers = [];

export const createWorker = (queueName, processor) => {
    const worker = new Worker(queueName, async (job) => {
        logger.debug(`[Worker][${queueName}] Processing job: ${job.id}`);
        try {
            await processor(job);
        } catch (error) {
            logger.error(`[Worker][${queueName}] Job ${job.id} failed:`, error);
            throw error; // Re-throw to trigger BullMQ retry logic
        }
    }, {
        connection: getSharedConnection(),
        concurrency: 5,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 1000 },
    });

    worker.on('completed', (job) => {
        logger.debug(`[Worker][${queueName}] Job ${job.id} completed.`);
    });

    worker.on('failed', (job, err) => {
        logger.error(`[Worker][${queueName}] Job ${job.id} failed permanently:`, err);
    });

    workers.push(worker);
    return worker;
};

export const closeWorkers = async () => {
    logger.info('Closing all background workers...');
    await Promise.all(workers.map(worker => worker.close()));
    logger.info('All background workers closed.');
};
