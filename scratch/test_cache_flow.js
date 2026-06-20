import { cacheService } from "../server/src/services/cache.service.js";
import { cacheInvalidationService } from "../server/src/services/cacheInvalidation.service.js";
import { CACHE_KEYS } from "../server/src/utils/cacheKeys.js";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function run() {
  console.log("Testing cacheService and cacheInvalidationService...");

  const testUserId = new mongoose.Types.ObjectId().toString();
  const authKey = CACHE_KEYS.USER_AUTH(testUserId);
  const meKey = CACHE_KEYS.USER_ME(testUserId);

  console.log("1. Setting USER_AUTH and USER_ME...");
  await cacheService.hset(authKey, { _id: testUserId, role: "brand" }, 60);
  await cacheService.set(meKey, { user: { _id: testUserId }, completion: true }, 60);

  const authData = await cacheService.hgetall(authKey);
  const meData = await cacheService.get(meKey);

  if (authData && authData._id === testUserId) {
    console.log("✅ USER_AUTH set and retrieved successfully.");
  } else {
    console.error("❌ USER_AUTH failed.");
  }

  if (meData && meData.completion === true) {
    console.log("✅ USER_ME set and retrieved successfully.");
  } else {
    console.error("❌ USER_ME failed.");
  }

  
  console.log("1.5. Setting BRAND_PROFILE and INFLUENCER_PROFILE...");
  await cacheService.set(CACHE_KEYS.BRAND_PROFILE(testUserId), { test: true }, 60);
  await cacheService.set(CACHE_KEYS.INFLUENCER_PROFILE(testUserId), { test: true }, 60);

  console.log("2. Testing cacheInvalidationService...");

  
  await cacheInvalidationService.invalidateUser(testUserId);
  await cacheInvalidationService.invalidateBrand(testUserId);
  await cacheInvalidationService.invalidateInfluencer(testUserId);


  const postAuthData = await cacheService.hgetall(authKey);
  const postMeData = await cacheService.get(meKey);

  if (!postAuthData) {
    console.log("✅ USER_AUTH invalidated successfully.");
  } else {
    console.error("❌ USER_AUTH invalidation failed.");
  }

  
  const postBrandData = await cacheService.get(CACHE_KEYS.BRAND_PROFILE(testUserId));
  const postInfData = await cacheService.get(CACHE_KEYS.INFLUENCER_PROFILE(testUserId));

  if (!postBrandData) console.log("✅ BRAND_PROFILE invalidated successfully.");
  else console.error("❌ BRAND_PROFILE invalidation failed.");

  if (!postInfData) console.log("✅ INFLUENCER_PROFILE invalidated successfully.");
  else console.error("❌ INFLUENCER_PROFILE invalidation failed.");

  if (!postMeData) {

    console.log("✅ USER_ME invalidated successfully.");
  } else {
    console.error("❌ USER_ME invalidation failed.");
  }

  process.exit(0);
}

run();
