import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_Name = "brandly";

async function testConnection() {
    let uri = MONGODB_URI;
    if (uri.includes('?')) {
        const [base, query] = uri.split('?');
        const separator = base.endsWith('/') ? '' : '/';
        uri = `${base}${separator}${DB_Name}?${query}`;
    } else {
        const separator = uri.endsWith('/') ? '' : '/';
        uri = `${uri}${separator}${DB_Name}`;
    }

    console.log("Testing URI:", uri);
    try {
        await mongoose.connect(uri);
        console.log("SUCCESS: Connected to MongoDB");
        await mongoose.disconnect();
    } catch (err) {
        console.error("FAILURE: Could not connect to MongoDB");
        console.error("Error Code:", err.code);
        console.error("Error Message:", err.message);
    }
}

testConnection();
