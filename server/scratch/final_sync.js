import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: 'server/.env' });

const DB_Name = "brandly";

const run = async () => {
    let uri = process.env.MONGODB_URI;
    if (uri.includes('?')) {
        const [base, query] = uri.split('?');
        const separator = base.endsWith('/') ? '' : '/';
        uri = `${base}${separator}${DB_Name}?${query}`;
    } else {
        const separator = uri.endsWith('/') ? '' : '/';
        uri = `${uri}${separator}${DB_Name}`;
    }

    await mongoose.connect(uri);
    console.log('Connected to:', mongoose.connection.name);

    const res = await mongoose.connection.db.collection('users').updateMany(
        {}, 
        { $set: { stripeOnboardingComplete: true } }
    );
    
    console.log(`Updated ${res.modifiedCount} users in ${mongoose.connection.name}`);
    await mongoose.disconnect();
};

run().catch(console.error);
