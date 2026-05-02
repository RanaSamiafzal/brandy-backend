import mongoose from 'mongoose';
import User from '../src/modules/user/user.model.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'samiweditr@gmail.com';
    const user = await User.findOne({ email }).select("-password -refreshToken");
    
    console.log('User found via Mongoose model:');
    console.log(JSON.stringify(user, null, 2));

    await mongoose.disconnect();
};

run().catch(console.error);
