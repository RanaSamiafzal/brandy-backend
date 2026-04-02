import mongoose from "mongoose";
import { DB_Name } from "../constant.js";

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined in environment variables. Check your .env file.");
        }

        const uri = process.env.MONGODB_URI.endsWith('/') 
            ? `${process.env.MONGODB_URI}${DB_Name}`
            : `${process.env.MONGODB_URI}/${DB_Name}`;

        const Dbconnection = await mongoose.connect(uri);
        console.log(`\n MongoDB connected !! DB HOST : ${Dbconnection.connection.host}`);

    } catch (error) {
        console.error('MongoDB connection Failed: ', error.message);
        process.exit(1);
    }
}

export default connectDB ;