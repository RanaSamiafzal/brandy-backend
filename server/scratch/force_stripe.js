import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Stripe from 'stripe';
dotenv.config({ path: 'server/.env' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const email = 'samiweditr@gmail.com';
    const user = await mongoose.connection.db.collection('users').findOne({ email });
    
    if (!user) {
        console.log('User not found');
        process.exit(1);
    }

    console.log('Found user:', user._id, user.role);

    if (user.stripeAccountId) {
        console.log('User already has stripeAccountId:', user.stripeAccountId);
    } else {
        console.log('Creating Stripe account...');
        const account = await stripe.accounts.create({
            type: 'express',
            email: user.email,
            capabilities: {
                transfers: { requested: true },
            },
        });

        console.log('Created account:', account.id);

        const result = await mongoose.connection.db.collection('users').updateOne(
            { _id: user._id },
            { $set: { stripeAccountId: account.id, stripeOnboardingComplete: true } }
        );

        console.log('Update result:', result);
    }

    await mongoose.disconnect();
};

run().catch(console.error);
