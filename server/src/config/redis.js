import Redis from 'ioredis';
import logger from '../utils/logger.js';

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
};

let redisConnection = null;

export const getRedisConnection = () => {
    if (!redisConnection) {
        redisConnection = new Redis(redisConfig);
        
        redisConnection.on('connect', () => {
            logger.info('✅ Redis connected successfully');
        });

        redisConnection.on('error', (err) => {
            logger.error('❌ Redis Connection Error:', err);
        });
    }
    return redisConnection;
};

let sharedConnection = null;

export const getSharedConnection = () => {
    if (!sharedConnection) {
        sharedConnection = new Redis(redisConfig);
        sharedConnection.on('error', (err) => logger.error('Shared Redis Error:', err));
    }
    return sharedConnection;
};

export const closeRedis = async () => {
    logger.info('Closing Redis connections...');
    if (redisConnection) await redisConnection.quit();
    if (sharedConnection) await sharedConnection.quit();
    logger.info('Redis connections closed.');
};

export default redisConfig;
