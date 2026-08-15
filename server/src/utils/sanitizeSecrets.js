/**
 * Strip credentials that must never leave the API (JWT refresh tokens, OAuth
 * refresh tokens, password hashes, OTP hashes). Used by User toJSON and a
 * global res.json sanitizer so lean()/aggregate payloads cannot leak either.
 */

export const USER_SAFE_SELECT =
    "-password -refreshTokens -passwordResetOTP -passwordResetExpires -emailVerificationOTP -emailVerificationOTPExpires";

const SENSITIVE_KEYS = new Set([
    "password",
    "refreshTokens",
    "refreshToken",
    "passwordResetOTP",
    "passwordResetExpires",
    "emailVerificationOTP",
    "emailVerificationOTPExpires",
]);

const PUBLIC_PLATFORM_FIELDS = [
    "platform",
    "username",
    "platformUserId",
    "profileUrl",
    "connected",
    "verified",
    "lastSyncedAt",
    "updatedAt",
    "_id",
];

export const sanitizeVerifiedPlatforms = (platforms) => {
    if (!Array.isArray(platforms)) return platforms;
    return platforms.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const src = typeof entry.toObject === "function" ? entry.toObject() : entry;
        const clean = {};
        for (const key of PUBLIC_PLATFORM_FIELDS) {
            if (src[key] !== undefined) clean[key] = src[key];
        }
        return clean;
    });
};

const scrubPlain = (value) => {
    if (value == null) return value;
    if (typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(scrubPlain);

    const out = {};
    for (const [key, nested] of Object.entries(value)) {
        if (SENSITIVE_KEYS.has(key)) continue;
        if (key === "verifiedPlatforms") {
            out[key] = sanitizeVerifiedPlatforms(nested);
            continue;
        }
        out[key] = scrubPlain(nested);
    }
    return out;
};

export const stripSecretsDeep = (value) => {
    if (value == null) return value;
    try {
        return scrubPlain(JSON.parse(JSON.stringify(value)));
    } catch {
        return value;
    }
};

export const applyUserSecretTransform = (_doc, ret) => {
    delete ret.password;
    delete ret.refreshTokens;
    delete ret.passwordResetOTP;
    delete ret.passwordResetExpires;
    delete ret.emailVerificationOTP;
    delete ret.emailVerificationOTPExpires;
    if (ret.verifiedPlatforms) {
        ret.verifiedPlatforms = sanitizeVerifiedPlatforms(ret.verifiedPlatforms);
    }
    return ret;
};

export const isListedMember = (userId, ids) => {
    if (!userId || !Array.isArray(ids)) return false;
    const uid = String(userId);
    return ids.some((id) => String(id?._id || id) === uid);
};
