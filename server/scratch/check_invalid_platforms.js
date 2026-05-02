import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/modules/user/user.model.js';

dotenv.config();

const checkUsers = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        const users = await User.find({ "verifiedPlatforms.0": { $exists: true } });
        console.log(`Found ${users.length} users with verifiedPlatforms`);

        for (const user of users) {
            user.verifiedPlatforms.forEach((vp, index) => {
                if (!vp.platform) {
                    console.log(`User ${user._id} (${user.email}) has invalid platform at index ${index}:`, vp);
                }
            });
        }

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

checkUsers();
