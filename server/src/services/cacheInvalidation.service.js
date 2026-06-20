import { cacheService } from "./cache.service.js";
import { CACHE_KEYS } from "../utils/cacheKeys.js";
import logger from "../utils/logger.js";

export const cacheInvalidationService = {
  /**
   * Deletes all cached data related to a user's authentication and base profile.
   * Call this on ANY write to fields: role, isBlocked, isDeactivated, profileComplete, email, fullname
   */
  async invalidateUser(userId) {
    if (!userId) return;
    try {
      // Invalidate Auth Cache (verifyJwt)
      await cacheService.del(CACHE_KEYS.USER_AUTH(userId));
      // Invalidate /users/me read endpoint
      await cacheService.del(CACHE_KEYS.USER_ME(userId));
      
      logger.debug(`[CacheInvalidation] Invalidated caches for user: ${userId}`);
    } catch (err) {
      logger.error(`[CacheInvalidation] Failed to invalidate cache for user: ${userId}`, err);
    }
  },

  /**
   * Deletes all cached data related to a Brand profile.
   * Call this when a brand updates their profile, creates a campaign, or any dashboard-affecting action occurs.
   */
  async invalidateBrand(userId) {
    if (!userId) return;
    try {
      await cacheService.del(CACHE_KEYS.BRAND_PROFILE(userId));
      await cacheService.del(CACHE_KEYS.BRAND_DASHBOARD(userId));
      logger.debug(`[CacheInvalidation] Invalidated Brand caches for user: ${userId}`);
    } catch (err) {
      logger.error(`[CacheInvalidation] Failed to invalidate Brand cache for user: ${userId}`, err);
    }
  },

  /**
   * Deletes all cached data related to an Influencer profile.
   * Call this when an influencer updates their profile or any dashboard-affecting action occurs.
   */
  async invalidateInfluencer(userId) {
    if (!userId) return;
    try {
      await cacheService.del(CACHE_KEYS.INFLUENCER_PROFILE(userId));
      await cacheService.del(CACHE_KEYS.INFLUENCER_DASHBOARD(userId));
      logger.debug(`[CacheInvalidation] Invalidated Influencer caches for user: ${userId}`);
    } catch (err) {
      logger.error(`[CacheInvalidation] Failed to invalidate Influencer cache for user: ${userId}`, err);
    }
  }
};
