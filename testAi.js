import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { getAiMatchForInfluencer } from './server/src/modules/aiMatch/aiMatch.controller.js';
import Influencer from './server/src/modules/influencer/influencer.model.js';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const inf = await Influencer.findOne().lean();
    if(!inf) {
      console.log("No influencer found in DB");
      process.exit(0);
    }
    
    console.log("Testing with User ID:", inf.user);
    const mockReq = {
      params: { id: inf.user.toString() },
      query: { type: "campaigns" }
    };
    
    const mockRes = {
      status: function(code) {
        this.statusCode = code;
        return this;
      },
      json: function(data) {
        console.log("Status:", this.statusCode);
        console.log("Data:", JSON.stringify(data, null, 2));
      }
    };
    
    // Override console.error temporarily to capture stack
    const originalError = console.error;
    console.error = function(...args) {
      originalError.apply(console, args);
      if (args[1] && args[1].stack) {
        originalError(args[1].stack);
      }
    };
    
    await getAiMatchForInfluencer(mockReq, mockRes);
  } catch(e) {
    console.error("Uncaught exception:", e);
  } finally {
    process.exit(0);
  }
}

run();
