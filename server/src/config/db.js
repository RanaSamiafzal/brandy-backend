import mongoose from "mongoose";
import { DB_Name } from "../constant.js";

const connectDB = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined in environment variables. Check your .env file.");
        }

        let uri = process.env.MONGODB_URI;
        if (uri.includes('?')) {
            const [base, query] = uri.split('?');
            const separator = base.endsWith('/') ? '' : '/';
            uri = `${base}${separator}${DB_Name}?${query}`;
        } else {
            const separator = uri.endsWith('/') ? '' : '/';
            uri = `${uri}${separator}${DB_Name}`;
        }

        const Dbconnection = await mongoose.connect(uri);
        console.log(`\n MongoDB connected !! DB HOST : ${Dbconnection.connection.host}`);

    } catch (error) {
        console.error('MongoDB connection Failed: ', error.message);
        process.exit(1);
    }
}

export default connectDB ;