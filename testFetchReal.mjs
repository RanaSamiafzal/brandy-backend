import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';



dotenv.config({ path: path.resolve('../brandy-backend/server/.env') });
import Influencer from './server/src/modules/influencer/influencer.model.js';
import fs from 'fs';

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB.");
    const inf = await Influencer.findOne().lean();
    if(!inf) {
      console.log("No influencer found");
      process.exit(0);
    }
    
    const url = `http://127.0.0.1:8000/api/v1/aiMatch/ai-match-influencer/${inf.user.toString()}?type=brands`;
    console.log("Fetching:", url);
    const res = await fetch(url);
    const text = await res.text();
    fs.writeFileSync('../brandin/fetch-result.txt', `Status: ${res.status}\nBody: ${text}`);
    console.log("Done");
  } catch(e) {
    console.error("Error:", e);
    fs.writeFileSync('../brandin/fetch-result.txt', `Script Error: ${e.message}\n${e.stack}`);
  } finally {
    process.exit(0);
  }
}

run();
