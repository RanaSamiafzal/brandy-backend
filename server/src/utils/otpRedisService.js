import crypto from 'crypto';
import { getRedisConnection } from '../config/redis.js';
import logger from './logger.js';

// Define the atomic Lua script for verification, attempts tracking, and lockout enforcement
const LUA_VERIFY_SCRIPT = `
local otpData = redis.call('HMGET', KEYS[1], 'hashedOtp', 'attempts')
local hashedOtp = otpData[1]
local attempts = tonumber(otpData[2])

if not hashedOtp then
    return -2 -- Expired or not requested
end

if attempts >= tonumber(ARGV[2]) then
    -- Lockout already triggered
    redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3]))
    redis.call('DEL', KEYS[1])
    return -1
end

if hashedOtp == ARGV[1] then
    -- Success: Clean up keys and return success code
    redis.call('DEL', KEYS[1])
    return 1
else
    -- Mismatch: Increment attempts
    local newAttempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
    if newAttempts >= tonumber(ARGV[2]) then
        -- Maximum failures reached: Trigger Lockout
        redis.call('SET', KEYS[2], '1', 'EX', tonumber(ARGV[3]))
        redis.call('DEL', KEYS[1])
        return -1
    end
    return 0 -- Invalid OTP, count updated
end
`;

/**
 * Irreversibly hashes PII (emails) for privacy on unauthenticated routes
 */
export const hashEmail = (email) => {
    if (!email) return '';
    return crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
};

/**
 * Standardized key generator
 */
export const getKeys = (purpose, id) => {
    const cleanId = purpose === 'pwd-reset' ? hashEmail(id) : id;
    return {
        otp: `auth:otp:${purpose}:${cleanId}`,
        lockout: `auth:lockout:${purpose}:${cleanId}`,
        cooldown: `auth:cooldown:${purpose}:${cleanId}`,
        dailyLimit: `auth:daily-limit:${purpose}:${cleanId}`,
    };
};

/**
 * Check if the user is currently locked out
 */
export const checkLockout = async (purpose, id) => {
    try {
        const redis = getRedisConnection();
        const keys = getKeys(purpose, id);
        const locked = await redis.exists(keys.lockout);
        return locked === 1;
    } catch (error) {
        logger.error(`[Redis] Lockout check failed for ${purpose}/${id}:`, error);
        throw error;
    }
};

/**
 * Check if the user is within the resend cooldown (60 seconds)
 */
export const checkCooldown = async (purpose, id) => {
    try {
        const redis = getRedisConnection();
        const keys = getKeys(purpose, id);
        const coolingDown = await redis.exists(keys.cooldown);
        return coolingDown === 1;
    } catch (error) {
        logger.error(`[Redis] Cooldown check failed for ${purpose}/${id}:`, error);
        throw error;
    }
};

/**
 * Precise Sliding Window Daily Rate Limiter using Redis Sorted Sets
 */
export const checkAndIncrementDailyLimit = async (purpose, id, limit = 10) => {
    try {
        const redis = getRedisConnection();
        const keys = getKeys(purpose, id);
        const now = Date.now();
        const windowMs = 24 * 60 * 60 * 1000; // 24 hours
        const cutoff = now - windowMs;

        // 1. Evict expired entries older than 24 hours
        await redis.zremrangebyscore(keys.dailyLimit, 0, cutoff);

        // 2. Count requests in the sliding window
        const count = await redis.zcard(keys.dailyLimit);

        if (count >= limit) {
            return { allowed: false, count };
        }

        // 3. Write new request timestamp to Sorted Set
        const pipeline = redis.pipeline();
        pipeline.zadd(keys.dailyLimit, now, String(now));
        pipeline.expire(keys.dailyLimit, 86400); // 24 hours TTL
        await pipeline.exec();

        return { allowed: true, count: count + 1 };
    } catch (error) {
        logger.error(`[Redis] Daily limit write failed for ${purpose}/${id}:`, error);
        throw error;
    }
};

/**
 * Store standard OTP fields under a Redis Hash with a cooldown lock
 */
export const storeOTP = async (purpose, id, hashedOtp, ttlSeconds = 600, cooldownSeconds = 60) => {
    try {
        const redis = getRedisConnection();
        const keys = getKeys(purpose, id);

        const pipeline = redis.pipeline();
        
        // 1. Store OTP Hash
        pipeline.hset(keys.otp, 'hashedOtp', hashedOtp, 'attempts', '0');
        pipeline.expire(keys.otp, ttlSeconds);

        // 2. Store Cooldown Key
        pipeline.set(keys.cooldown, '1', 'EX', cooldownSeconds);

        await pipeline.exec();
        logger.debug(`[Redis] OTP stored successfully for ${purpose}/${id}`);
    } catch (error) {
        logger.error(`[Redis] OTP storage failed for ${purpose}/${id}:`, error);
        throw error;
    }
};

/**
 * Atomic verification using Lua script
 * Returns:
 *  1 = Success
 *  0 = Invalid OTP
 * -1 = Lockout Triggered (max attempts reached)
 * -2 = Expired / Not Found
 */
export const verifyOTP = async (purpose, id, inputHashedOtp, maxAttempts = 5, lockoutTtlSeconds = 3600) => {
    try {
        const redis = getRedisConnection();
        const keys = getKeys(purpose, id);

        // Define verifyOtpLua if not already registered on the ioredis instance
        if (typeof redis.verifyOtpLua !== 'function') {
            redis.defineCommand('verifyOtpLua', {
                numberOfKeys: 2,
                lua: LUA_VERIFY_SCRIPT
            });
        }

        const result = await redis.verifyOtpLua(
            keys.otp,
            keys.lockout,
            inputHashedOtp,
            String(maxAttempts),
            String(lockoutTtlSeconds)
        );

        logger.debug(`[Redis] Atomic verify result for ${purpose}/${id}: ${result}`);
        return result;
    } catch (error) {
        logger.error(`[Redis] Atomic verification error for ${purpose}/${id}:`, error);
        throw error;
    }
};

/**
 * Manually delete OTP keys on successful authentication
 */
export const clearOTP = async (purpose, id) => {
    try {
        const redis = getRedisConnection();
        const keys = getKeys(purpose, id);
        await redis.del(keys.otp);
    } catch (error) {
        logger.warn(`[Redis] Failed to clear OTP keys for ${purpose}/${id}:`, error);
    }
};

export const otpRedis = {
    hashEmail,
    getKeys,
    checkLockout,
    checkCooldown,
    checkAndIncrementDailyLimit,
    storeOTP,
    verifyOTP,
    clearOTP
};

