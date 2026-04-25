import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve('./.env') });

const DB_Name = "brandly";
const MONGODB_URI = process.env.MONGODB_URI;

const uri = MONGODB_URI.endsWith('/') 
    ? `${MONGODB_URI}${DB_Name}`
    : `${MONGODB_URI}/${DB_Name}`;

console.log("Original URI:", MONGODB_URI);
console.log("Constructed URI:", uri);

try {
    const connection = new mongoose.Mongoose();
    // We just want to see how it parses
    console.log("Parsed Host:", MONGODB_URI.split('@')[1]?.split('/')[0]);
} catch (e) {
    console.log("Error:", e);
}
