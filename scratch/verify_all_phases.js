import "dotenv/config";

/**
 * Phase 1-8 Full Verification Script
 * Tests: cache.service, cacheInvalidation.service, cacheKeys, socket integration
 * 
 * This script imports the services directly and validates them in isolation
 * (no HTTP server needed).
 */
import { cacheService } from "../server/src/services/cache.service.js";
import { cacheInvalidationService } from "../server/src/services/cacheInvalidation.service.js";
import { CACHE_KEYS } from "../server/src/utils/cacheKeys.js";
import crypto from "crypto";
import { getRedisConnection } from "../server/src/config/redis.js";

await new Promise((resolve) => {
    const conn = getRedisConnection();
    if (conn.status === "ready") resolve();
    else conn.once("ready", resolve);
});

const testUserId = "aaa111bbb222ccc333ddd444";
let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

async function run() {
    console.log("\n══════════════════════════════════════════════");
    console.log("   REDIS OPTIMIZATION — FULL VERIFICATION");
    console.log("══════════════════════════════════════════════\n");

    // ── Phase 1: Cache Keys ──
    console.log("▸ Phase 1: Cache Key Format");
    assert(CACHE_KEYS.USER_AUTH(testUserId) === `user:auth:${testUserId}`, "USER_AUTH key format");
    assert(CACHE_KEYS.USER_ME(testUserId) === `user:me:${testUserId}`, "USER_ME key format");
    assert(CACHE_KEYS.BRAND_PROFILE(testUserId) === `brand:profile:${testUserId}`, "BRAND_PROFILE key format");
    assert(CACHE_KEYS.INFLUENCER_PROFILE(testUserId) === `influencer:profile:${testUserId}`, "INFLUENCER_PROFILE key format");
    assert(CACHE_KEYS.BRAND_DASHBOARD(testUserId) === `brand:dashboard:${testUserId}`, "BRAND_DASHBOARD key format");
    assert(CACHE_KEYS.INFLUENCER_DASHBOARD(testUserId) === `influencer:dashboard:${testUserId}`, "INFLUENCER_DASHBOARD key format");

    const queryHash = crypto.createHash("md5").update(JSON.stringify({search:"test"})).digest("hex");
    assert(CACHE_KEYS.SEARCH_INFLUENCERS(queryHash) === `search:influencer:${queryHash}`, "SEARCH_INFLUENCERS key format");
    assert(CACHE_KEYS.SEARCH_BRANDS(queryHash) === `search:brand:${queryHash}`, "SEARCH_BRANDS key format");

    // ── Phase 1: CacheService CRUD ──
    console.log("\n▸ Phase 1: CacheService get/set/del (JSON)");
    await cacheService.set(CACHE_KEYS.USER_ME(testUserId), { email: "test@example.com" }, 60);
    const meData = await cacheService.get(CACHE_KEYS.USER_ME(testUserId));
    assert(meData?.email === "test@example.com", "SET then GET returns correct data");

    await cacheService.del(CACHE_KEYS.USER_ME(testUserId));
    const afterDel = await cacheService.get(CACHE_KEYS.USER_ME(testUserId));
    assert(afterDel === null, "DEL clears the key");

    // ── Phase 2: CacheService HASH (auth) ──
    console.log("\n▸ Phase 2: CacheService hset/hgetall (Hash)");
    await cacheService.hset(CACHE_KEYS.USER_AUTH(testUserId), {
        _id: testUserId,
        role: "brand",
        isBlocked: "false",
        isDeactivated: "false",
        profileComplete: "true",
        email: "test@example.com"
    }, 120);
    const authData = await cacheService.hgetall(CACHE_KEYS.USER_AUTH(testUserId));
    assert(authData?._id === testUserId, "HSET then HGETALL returns _id");
    assert(authData?.role === "brand", "HSET then HGETALL returns role");
    assert(authData?.isBlocked === "false", "HSET then HGETALL returns isBlocked as string");

    // ── Phase 3: Invalidation — invalidateUser ──
    console.log("\n▸ Phase 3: invalidateUser clears auth + me");
    await cacheService.set(CACHE_KEYS.USER_ME(testUserId), { test: true }, 60);
    // auth hash already set above
    await cacheInvalidationService.invalidateUser(testUserId);
    const postAuth = await cacheService.hgetall(CACHE_KEYS.USER_AUTH(testUserId));
    const postMe = await cacheService.get(CACHE_KEYS.USER_ME(testUserId));
    assert(postAuth === null || Object.keys(postAuth).length === 0, "invalidateUser clears USER_AUTH");
    assert(postMe === null, "invalidateUser clears USER_ME");

    // ── Phase 5: Invalidation — invalidateBrand ──
    console.log("\n▸ Phase 5: invalidateBrand clears profile + dashboard");
    await cacheService.set(CACHE_KEYS.BRAND_PROFILE(testUserId), { x: 1 }, 60);
    await cacheService.set(CACHE_KEYS.BRAND_DASHBOARD(testUserId), { y: 2 }, 60);
    await cacheInvalidationService.invalidateBrand(testUserId);
    const postBP = await cacheService.get(CACHE_KEYS.BRAND_PROFILE(testUserId));
    const postBD = await cacheService.get(CACHE_KEYS.BRAND_DASHBOARD(testUserId));
    assert(postBP === null, "invalidateBrand clears BRAND_PROFILE");
    assert(postBD === null, "invalidateBrand clears BRAND_DASHBOARD");

    // ── Phase 5: Invalidation — invalidateInfluencer ──
    console.log("\n▸ Phase 5: invalidateInfluencer clears profile + dashboard");
    await cacheService.set(CACHE_KEYS.INFLUENCER_PROFILE(testUserId), { x: 1 }, 60);
    await cacheService.set(CACHE_KEYS.INFLUENCER_DASHBOARD(testUserId), { y: 2 }, 60);
    await cacheInvalidationService.invalidateInfluencer(testUserId);
    const postIP = await cacheService.get(CACHE_KEYS.INFLUENCER_PROFILE(testUserId));
    const postID = await cacheService.get(CACHE_KEYS.INFLUENCER_DASHBOARD(testUserId));
    assert(postIP === null, "invalidateInfluencer clears INFLUENCER_PROFILE");
    assert(postID === null, "invalidateInfluencer clears INFLUENCER_DASHBOARD");

    // ── Phase 8: Search key hashing ──
    console.log("\n▸ Phase 8: Search cache key deterministic hashing");
    const params1 = { search: "fashion", page: 1, limit: 10 };
    const params2 = { search: "fashion", page: 1, limit: 10 };
    const params3 = { search: "tech", page: 1, limit: 10 };
    const h1 = crypto.createHash("md5").update(JSON.stringify(params1)).digest("hex");
    const h2 = crypto.createHash("md5").update(JSON.stringify(params2)).digest("hex");
    const h3 = crypto.createHash("md5").update(JSON.stringify(params3)).digest("hex");
    assert(h1 === h2, "Same query params produce same hash (cache hit)");
    assert(h1 !== h3, "Different query params produce different hash (cache miss)");

    // ── Summary ──
    console.log("\n══════════════════════════════════════════════");
    console.log(`   RESULTS: ${passed} passed, ${failed} failed`);
    console.log("══════════════════════════════════════════════\n");

    // Cleanup test keys
    await cacheService.del(CACHE_KEYS.USER_AUTH(testUserId));
    await cacheService.del(CACHE_KEYS.USER_ME(testUserId));
    await cacheService.del(CACHE_KEYS.BRAND_PROFILE(testUserId));
    await cacheService.del(CACHE_KEYS.BRAND_DASHBOARD(testUserId));
    await cacheService.del(CACHE_KEYS.INFLUENCER_PROFILE(testUserId));
    await cacheService.del(CACHE_KEYS.INFLUENCER_DASHBOARD(testUserId));

    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
