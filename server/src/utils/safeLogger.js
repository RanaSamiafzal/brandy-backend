const isProd = process.env.NODE_ENV === "production";

// Keys that commonly contain secrets / PII
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "jwt",
  "accessToken",
  "refreshToken",
  "authorization",
  "Authorization",
  "cookie",
  "cookies",
  "otp",
  "reset",
  "email",
  "phone",
  "phoneNumber",
  "ssn",
  "secret",
  "apiKey",
  "API_KEY",
  "client_secret",
  "clientSecret",
]);

function sanitizeValue(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    const v = value.trim();
    // If it looks like a token/JWT, avoid printing it.
    const looksLikeJwt = v.split(".").length === 3 && /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(v);
    if (looksLikeJwt) return "[REDACTED_JWT]";
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((v) => sanitizeValue(v));
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeValue(v);
      }
    }
    return out;
  }

  return value;
}

function sanitizeMeta(meta) {
  if (!meta) return undefined;
  return sanitizeValue(meta);
}

function withMeta(prefix, meta, loggerFn) {
  if (meta === undefined) return loggerFn(prefix);
  return loggerFn(prefix, sanitizeMeta(meta));
}

const safeLogger = {
  info: (message, meta) => {
    if (isProd) return; // production-safe: no noisy info
    withMeta(message, meta, console.info.bind(console));
  },
  warn: (message, meta) => {
    // warnings can happen in prod, but keep sanitized
    if (isProd) return withMeta(message, meta, console.warn.bind(console));
    withMeta(message, meta, console.warn.bind(console));
  },
  error: (message, meta) => {
    // Always log errors, but never raw meta
    const safeMessage = message || "[ERROR]";
    if (meta === undefined) return console.error(safeMessage);

    // If error object, avoid printing stack with potentially sensitive content; keep message only.
    if (meta instanceof Error) {
      return console.error(safeMessage, { name: meta.name, message: meta.message });
    }

    return withMeta(safeMessage, meta, console.error.bind(console));
  },
};

export default safeLogger;


