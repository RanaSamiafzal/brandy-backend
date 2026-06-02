import { getRedisConnection } from "../config/redis.js";
import { cacheHit, cacheMiss, cacheError, cacheSet, cacheDelete } from "./cacheMetrics.js";

const redis = getRedisConnection()

// Getting value from cache
const get = async (key) => {
    try {
        const data = await redis.get(key);

        if (!data) return null;

        return JSON.parse(data);
    } catch (error) {
        cacheError(key, error);
        return null;
    }
};



//Setting value in cache
const set = async (
    key,
    value,
    ttlSeconds = 3600
) => {
    try {
        await redis.set(
            key,
            JSON.stringify(value),
            "EX",
            ttlSeconds
        );

        cacheSet(key);

        return true;
    } catch (error) {
        cacheError(key, error);
        return false;
    }
};

//deleting values from redis
const del = async (key) => {
    try {
        await redis.del(key);

        cacheDelete(key);

        return true;
    } catch (error) {
        cacheError(key, error);
        return false;
    }
};


// check the existing values in redis
const exists = async (key) => {
    try {
        return await redis.exists(key);
    } catch {
        return 0;
    }
};


// check the time to live of a key
const ttl = async (key) => {
    try {
        return await redis.ttl(key);
    } catch {
        return -1;
    }
};




export default {
    get,
    set,
    del,
    exists,
    ttl,
};