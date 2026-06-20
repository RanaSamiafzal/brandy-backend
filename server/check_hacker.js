import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

import User from './src/modules/user/user.model.js';
import Influencer from './src/modules/influencer/influencer.model.js';

async function check() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('DB Connected');
        
        const users = await User.find({
            $or: [
                { fullname: /hacker/i },
                { email: /hacker/i }
            ]
        });
        console.log('Found Users:', users);

        const influencers = await Influencer.find({
            $or: [
                { username: /hacker/i }
            ]
        });
        console.log('Found Influencers:', influencers);

    } catch (error) {
        console.error(error);
    } finally {
        await mongoose.disconnect();
    }
}

check();
