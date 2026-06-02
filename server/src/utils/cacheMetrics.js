import logger from "./logger.js";

export const cacheHit = (key) => {
    logger.info(`[CACHE HIT] ${key}`);
};

export const cacheMiss = (key) => {
    logger.info(`[CACHE MISS] ${key}`);
};

export const cacheSet = (key) => {
    logger.info(`[CACHE SET] ${key}`);
};

export const cacheDelete = (key) => {
    logger.info(`[CACHE DEL] ${key}`);
};

export const cacheError = (key, error) => {
    logger.error(
        `[CACHE ERROR] ${key}: ${error.message}`
    );
};

