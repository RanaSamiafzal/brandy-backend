import mongoose from "mongoose";
import { DB_Name } from "../constant.js";

const connectDB =async()=>{
    try{
       const Dbconnection= await mongoose.connect(`${process.env.MONGODB_URI}/${DB_Name}`)
       console.log(`\n MongoDB connected !! DB HOST : ${Dbconnection.connection.host}`);

    }catch (error) {
        console.log('MongoDB connection Failed ',error);
        process.exit(1)
    }
}

export default connectDB ;