// Run: node server/scratch/complete_onboarding.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find users with stripeAccountId but not yet marked complete
    const result = await mongoose.connection.db.collection('users').updateMany(
        { stripeAccountId: { $exists: true, $ne: null }, stripeOnboardingComplete: { $ne: true } },
        { $set: { stripeOnboardingComplete: true } }
    );

    console.log(`Updated ${result.modifiedCount} user(s) with stripeOnboardingComplete = true`);
    
    // Show which users have Stripe accounts
    const users = await mongoose.connection.db.collection('users')
        .find({ stripeAccountId: { $exists: true } })
        .project({ fullname: 1, email: 1, role: 1, stripeAccountId: 1, stripeOnboardingComplete: 1 })
        .toArray();
    
    console.log('Users with Stripe accounts:', users);
    
    await mongoose.disconnect();
};

run().catch(console.error);
