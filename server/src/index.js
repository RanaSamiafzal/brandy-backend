import dotenv from 'dotenv';
import path from 'path';

console.log("CWD:", process.cwd());
const envPath = path.resolve('./.env');
console.log("Loading .env from:", envPath);
const result = dotenv.config({
    path: envPath
});

if (result.error) {
    console.error("Failed to load .env file:", result.error);
} else {
    console.log(".env loaded successfully. Variables injected:", Object.keys(result.parsed || {}).length);
}
import connectDB from "./config/db.js";
import { createServer } from "http";
import { Server } from "socket.io";
import User from "./modules/user/user.model.js";
import { app } from './app.js'
import initializeSocket from "./config/socket.js";

import mongoose from "mongoose";

const requiredEnvVars = ["MONGODB_URI", "ACCESS_TOKEN_SECRET", "CORS_ORIGIN", "STRIPE_SECRET_KEY"];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
    console.error(`FATAL ERROR: Missing required environment variables: ${missingEnvVars.join(", ")}`);
    process.exit(1);
}

const port = process.env.PORT || 8000;

const httpServer = createServer(app);
initializeSocket(httpServer, app);

connectDB()
    .then(() => {
        httpServer.listen(port, () => {
            console.log(`Server is running on port : ${port}`);
        })
        httpServer.on('error', (error) => {
            console.log(`ERROR : ${error}`);
            throw error
        })
    })
    .catch((err) => {
        console.log("MONGODB Connection failed !!! ", err);
        process.exit(1);
    });

const shutdown = () => {
    console.log("Received shutdown signal. Closing HTTP server...");
    httpServer.close(() => {
        console.log("HTTP server closed.");
        mongoose.connection.close(false).then(() => {
            console.log("MongoDB connection closed.");
            process.exit(0);
        });
    });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);