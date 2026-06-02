import cacheService from "./cacheService.js";
import { cacheHit, cacheMiss } from "./cacheMetrics.js";

const activeRebuilds = new Map();

export const getOrSetCache = async (
    key,
    fetchFn,
    ttl = 300
) => {
    // 1. Try to read from cache
    const cached = await cacheService.get(key);

    if (cached) {
        cacheHit(key);
        return cached;
    }

    cacheMiss(key);

    // 2. Cache Miss - check if another process/request is already fetching this key
    if (activeRebuilds.has(key)) {
        // Wait for the active rebuild to finish and return its result
        return activeRebuilds.get(key);
    }

    // 3. Initiate single-flight database load
    const rebuildPromise = (async () => {
        try {
            const data = await fetchFn();
            if (data) {
                await cacheService.set(key, data, ttl);
            }
            return data;
        } finally {
            // Clean up flight-tracker
            activeRebuilds.delete(key);
        }
    })();

    activeRebuilds.set(key, rebuildPromise);
    return rebuildPromise;
};

export default {
    getOrSetCache,
};
