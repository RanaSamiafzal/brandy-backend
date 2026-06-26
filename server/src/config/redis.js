import Redis from 'ioredis';
import logger from '../utils/logger.js';

const isProduction = process.env.REDIS_HOST && process.env.REDIS_HOST !== '127.0.0.1' && process.env.REDIS_HOST !== 'localhost';

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required by BullMQ
    lazyConnect: true, // It will not connect until the first command is sent.
    connectTimeout: 5000, // Connection will time out after 5 seconds.
    enableReadyCheck: true, // check if redis is ready or not before using it
    enableOfflineQueue: false, // Do not queue commands when connection is down (fail-open instead of hang)
    ...(isProduction && { tls: {} }), // Upstash requires TLS
};


let redisConnection = null;
let sharedConnection = null;

// Fallback logic
const handleRedisErrorFallback = (client, err, connectionName) => {
    if (err.code !== 'ECONNRESET' && err.code !== 'ENOTFOUND') {
        logger.error(`❌ ${connectionName} Error:`, err.message);
    }

    // If the error is a connection drop/failure and we are currently trying to connect to a remote host
    if ((err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') && client.options.host !== '127.0.0.1') {
        logger.warn(`⚠️ Cloud Redis failed (${err.code}). Falling back to local Redis (127.0.0.1:6379) for ${connectionName}...`);

        // Mutate the options so the next reconnect attempt uses local Redis
        client.options.host = '127.0.0.1';
        client.options.port = 6379;
        delete client.options.password;
        delete client.options.tls;
    }
};

export const getRedisConnection = () => {
    if (!redisConnection) {
        redisConnection = new Redis(redisConfig);

        redisConnection.on('connect', () => {
            logger.info('✅ Redis connected successfully');
        });

        redisConnection.on('error', (err) => {
            handleRedisErrorFallback(redisConnection, err, 'Main Redis');
        });

        redisConnection.on("reconnecting", () => {
            logger.warn("Redis reconnecting...");
        });
    }
    return redisConnection;
};

export const getSharedConnection = () => {
    if (!sharedConnection) {
        sharedConnection = new Redis(redisConfig);
        sharedConnection.on('error', (err) => {
            handleRedisErrorFallback(sharedConnection, err, 'Shared Redis');
        });

        // BullMQ uses .duplicate() to create blocking connections.
        // We override duplicate to ensure we attach an error handler to the new connections.
        const originalDuplicate = sharedConnection.duplicate.bind(sharedConnection);
        sharedConnection.duplicate = (...args) => {
            const duplicateConnection = originalDuplicate(...args);
            duplicateConnection.on('error', (err) => {
                handleRedisErrorFallback(duplicateConnection, err, 'Duplicated BullMQ Redis');
            });
            return duplicateConnection;
        };
    }
    return sharedConnection;
};

export const closeRedis = async () => {
    logger.info('Closing Redis connections...');
    try {
        if (redisConnection && redisConnection.status !== 'end') {
            await redisConnection.quit();
        }
    } catch (err) {
        logger.warn('Warning closing redisConnection:', err.message);
        if (redisConnection) redisConnection.disconnect();
    }

    try {
        if (sharedConnection && sharedConnection.status !== 'end') {
            await sharedConnection.quit();
        }
    } catch (err) {
        logger.warn('Warning closing sharedConnection:', err.message);
        if (sharedConnection) sharedConnection.disconnect();
    }
    logger.info('Redis connections closed.');
};


export const isRedisReady = () => {
    return redisConnection?.status === "ready";
};



export default redisConfig;
