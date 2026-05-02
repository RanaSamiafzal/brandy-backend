import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const users = await mongoose.connection.db.collection('users')
        .find({})
        .project({ fullname: 1, email: 1, role: 1, stripeAccountId: 1, stripeOnboardingComplete: 1 })
        .toArray();
    
    console.log(`Total users: ${users.length}`);
    users.forEach(u => console.log(JSON.stringify(u)));

    await mongoose.disconnect();
};

run().catch(console.error);
