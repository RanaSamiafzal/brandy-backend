import crypto from 'crypto';
import ApiKey from '../modules/auth/apiKey.model.js';

/**
 * Resolve Brandly agent API key from request headers.
 * Accepts X-API-KEY / x-api-key, or Authorization: Bearer <key>.
 *
 * @param {import('express').Request} req
 * @returns {Promise<{ user: object, scopes: string[], apiKeyId: string }>}
 */
export async function resolveApiKeyFromRequest(req) {
    const rawApiKey = extractRawApiKey(req);

    if (!rawApiKey) {
        const err = new Error('API key missing. Send X-API-KEY or Authorization: Bearer <key>.');
        err.status = 401;
        throw err;
    }

    const keyHash = crypto.createHash('sha256').update(rawApiKey).digest('hex');
    const apiKeyRecord = await ApiKey.findOne({ keyHash, isActive: true }).populate('owner');

    if (!apiKeyRecord) {
        const err = new Error('Invalid or revoked API key');
        err.status = 401;
        throw err;
    }

    if (apiKeyRecord.expiresAt && new Date() > apiKeyRecord.expiresAt) {
        const err = new Error('API key has expired');
        err.status = 401;
        throw err;
    }

    if (apiKeyRecord.owner && (apiKeyRecord.owner.isBlocked || apiKeyRecord.owner.isDeactivated)) {
        const err = new Error('Account associated with this API key is blocked or deactivated');
        err.status = 403;
        throw err;
    }

    apiKeyRecord.lastUsedAt = new Date();
    apiKeyRecord.save({ validateBeforeSave: false }).catch(() => {});

    return {
        user: apiKeyRecord.owner,
        scopes: apiKeyRecord.scopes || [],
        apiKeyId: apiKeyRecord._id.toString(),
    };
}

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractRawApiKey(req) {
    const headerKey = req.header('X-API-KEY') || req.header('x-api-key');
    if (headerKey) return headerKey.trim();

    const auth = req.header('Authorization') || req.header('authorization');
    if (!auth) return null;

    const match = auth.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

/**
 * Ensure the authenticated agent has the required scope.
 * @param {string[]} scopes
 * @param {string} requiredScope
 */
export function assertScope(scopes, requiredScope) {
    if (!requiredScope) return;
    if (!scopes?.includes(requiredScope)) {
        const err = new Error(`Forbidden: API key lacks '${requiredScope}' permission scope`);
        err.status = 403;
        throw err;
    }
}
