import { DB_Name } from "../constant.js";

/**
 * Validates that all required environment variables are present before the server starts.
 * This prevents runtime crashes due to missing configuration.
 */
const validateEnv = () => {
    const required = [
        "MONGODB_URI",
        "ACCESS_TOKEN_SECRET",
        "REFRESH_TOKEN_SECRET",
        "CORS_ORIGIN",
        "STRIPE_SECRET_KEY",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "REDIS_HOST",
        "STRIPE_WEBHOOK_SECRET"
    ];

    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.error(" ❌ FATAL ERROR: MISSING ENVIRONMENT VARIABLES");
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        missing.forEach((key) => console.error(`   • ${key}`));
        console.error("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        process.exit(1);
    }

    console.log("✅ Environment configuration validated.");
};

export default validateEnv;
