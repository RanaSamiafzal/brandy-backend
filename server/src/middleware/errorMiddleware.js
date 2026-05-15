import { ApiError } from "../utils/ApiError.js";
import logger from "../utils/logger.js";

/**
 * Global Error Handling Middleware
 */
const errorMiddleware = (err, req, res, next) => {
    let { statusCode, message } = err;

    // If error is not an instance of ApiError, set to 500
    if (!(err instanceof ApiError)) {
        statusCode = err.statusCode || 500;
        message = err.message || "Internal Server Error";
    }

    // Use centralized logger for production-safe error tracking
    logger.error(`API Error: ${message}`, err, { 
        url: req.url, 
        method: req.method,
        statusCode 
    });

    const response = {
        success: false,
        message,
        ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
        ...(err.errors && err.errors.length > 0 && { errors: err.errors })
    };

    res.status(statusCode).json(response);
};

export { errorMiddleware };
