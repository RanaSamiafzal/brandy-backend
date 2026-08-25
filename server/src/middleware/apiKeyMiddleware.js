import crypto from 'crypto';
import ApiKey from '../modules/auth/apiKey.model.js';
import { ApiError } from '../utils/ApiError.js';
import { AsyncHandler } from '../utils/Asynchandler.js';
import { validationStatus } from '../utils/ValidationStatusCode.js';
import User from '../modules/user/user.model.js';
import { verifyJwt } from './authMiddleware.js';

export const verifyApiKey = (requiredScope) => AsyncHandler(async (req, res, next) => {
    const rawApiKey = req.header('X-API-KEY') || req.header('x-api-key');

    if (!rawApiKey) {
        throw new ApiError(validationStatus.unauthorized, 'API key missing in request headers (X-API-KEY required)');
    }

    const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
    const apiKeyRecord = await ApiKey.findOne({ keyHash, isActive: true }).populate('owner');

    if (!apiKeyRecord) {
        throw new ApiError(validationStatus.unauthorized, 'Invalid or revoked API Key');
    }

    if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
        throw new ApiError(validationStatus.unauthorized, 'API Key has expired');
    }

    if (apiKeyRecord.owner && (apiKeyRecord.owner.isBlocked || apiKeyRecord.owner.isDeactivated)) {
        throw new ApiError(validationStatus.forbidden, 'Account associated with this API key is blocked or deactivated');
    }

    if (requiredScope && !apiKeyRecord.scopes.includes(requiredScope)) {
        throw new ApiError(validationStatus.forbidden, `Forbidden: API Key lacks '${requiredScope}' permission scope`);
    }

    // Update lastUsedAt asynchronously without blocking flow
    apiKeyRecord.lastUsedAt = new Date();
    apiKeyRecord.save({ validateBeforeSave: false }).catch(() => {});

    req.user = apiKeyRecord.owner;
    req.isAgent = true;
    req.apiKeyScopes = apiKeyRecord.scopes;

    next();
});

// Dual Auth Middleware: Accepts either X-API-KEY or JWT token (Cookies / Authorization header)
export const verifyAuthOrApiKey = (requiredScope) => (req, res, next) => {
    const hasApiKeyHeader = req.header('X-API-KEY') || req.header('x-api-key');
    if (hasApiKeyHeader) {
        return verifyApiKey(requiredScope)(req, res, next);
    }
    return verifyJwt(req, res, next);
};
