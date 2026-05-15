import dotenv from 'dotenv';
dotenv.config();

import validateEnv from "./utils/envValidator.js";
import logger from "./utils/logger.js";

// Validate environment variables on startup
validateEnv();

import connectDB from "./config/db.js";
import { createServer } from "http";
import { Server } from "socket.io";
import User from "./modules/user/user.model.js";
import { app } from './app.js';
import initializeSocket from "./config/socket.js";
import { initQueues, closeQueues } from "./queues/queueManager.js";
import { startWorkers, closeWorkers } from "./queues/index.js";
import { closeRedis } from "./config/redis.js";
import { registerListeners } from "./events/index.js";
import { initAdminCronJobs } from "./modules/admin/admin.cron.js";

import mongoose from "mongoose";

const port = process.env.PORT || 8000;

const httpServer = createServer(app);
initializeSocket(httpServer, app);

connectDB()
    .then(() => {
        // Initialize Event System & Background Workers
        initQueues();
        startWorkers();
        registerListeners();
        initAdminCronJobs();

        httpServer.listen(port, () => {
            logger.info(`Server is running on port : ${port}`);
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

const shutdown = async () => {
    console.log("Received shutdown signal. Initiating graceful shutdown...");
    
    try {
        await closeWorkers();
        await closeQueues();
        
        httpServer.close(async () => {
            console.log("HTTP server closed.");
            
            await closeRedis();
            
            mongoose.connection.close(false).then(() => {
                console.log("MongoDB connection closed.");
                process.exit(0);
            });
        });
    } catch (err) {
        console.error("Error during graceful shutdown:", err);
        process.exit(1);
    }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);