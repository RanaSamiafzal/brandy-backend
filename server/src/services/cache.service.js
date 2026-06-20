import { getRedisConnection } from "../config/redis.js";
import logger from "../utils/logger.js";

export const cacheService = {
  /**
   * Get parsed JSON from Redis
   */
  async get(key) {
    try {
      const redis = getRedisConnection();
      if (!redis) return null;
      
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (err) {
      logger.error(`[CacheService] GET Error for key ${key}:`, err);
      return null; // Fail-open
    }
  },

  /**
   * Set JSON string in Redis
   */
  async set(key, value, ttlSeconds = 3600) {
    try {
      const redis = getRedisConnection();
      if (!redis) return;
      
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      logger.error(`[CacheService] SET Error for key ${key}:`, err);
      // Fail-open
    }
  },

  /**
   * Delete key from Redis
   */
  async del(key) {
    try {
      const redis = getRedisConnection();
      if (!redis) return;

      await redis.del(key);
    } catch (err) {
      logger.error(`[CacheService] DEL Error for key ${key}:`, err);
      // Fail-open
    }
  },

  /**
   * Hash Get All
   */
  async hgetall(key) {
    try {
      const redis = getRedisConnection();
      if (!redis) return null;

      const data = await redis.hgetall(key);
      if (!data || Object.keys(data).length === 0) return null;
      return data;
    } catch (err) {
      logger.error(`[CacheService] HGETALL Error for key ${key}:`, err);
      return null;
    }
  },

  /**
   * Hash Set
   */
  async hset(key, valueObj, ttlSeconds = 3600) {
    try {
      const redis = getRedisConnection();
      if (!redis) return;

      await redis.hset(key, valueObj);
      await redis.expire(key, ttlSeconds);
    } catch (err) {
      logger.error(`[CacheService] HSET Error for key ${key}:`, err);
    }
  }
};
