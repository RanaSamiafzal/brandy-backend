import crypto from "crypto";

const STATE_TTL_MS = 15 * 60 * 1000;

const hmacSecret = () => process.env.ACCESS_TOKEN_SECRET || "dev-google-state";

const safeEqual = (a, b) => {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
};

export const encodeGoogleState = (payload) => {
    const body = Buffer.from(
        JSON.stringify({
            role: payload.role === "influencer" ? "influencer" : "brand",
            intent: payload.intent === "signup" ? "signup" : "login",
            ts: Date.now(),
        })
    ).toString("base64url");
    const sig = crypto.createHmac("sha256", hmacSecret()).update(body).digest("base64url");
    return `${body}.${sig}`;
};

export const decodeGoogleState = (state) => {
    if (!state || !String(state).includes(".")) {
        return { role: "brand", intent: "login" };
    }
    const [body, sig] = String(state).split(".");
    const expected = crypto.createHmac("sha256", hmacSecret()).update(body).digest("base64url");
    if (!safeEqual(sig, expected)) {
        const err = new Error("Invalid Google sign-in state. Try again.");
        err.statusCode = 400;
        throw err;
    }
    const data = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!data?.ts || Date.now() - Number(data.ts) > STATE_TTL_MS) {
        const err = new Error("Google sign-in expired. Try again.");
        err.statusCode = 400;
        throw err;
    }
    return {
        role: data.role === "influencer" ? "influencer" : "brand",
        intent: data.intent === "signup" ? "signup" : "login",
    };
};

export const frontendBaseUrl = () =>
    process.env.FRONTEND_URL || process.env.CLIENT_URL || process.env.CORS_ORIGIN || "http://localhost:3000";
