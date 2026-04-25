import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: './.env' });

const MONGODB_URI = process.env.MONGODB_URI;
const DB_Name = "brandly";

async function checkDatabase() {
    let uri = MONGODB_URI;
    if (uri.includes('?')) {
        const [base, query] = uri.split('?');
        const separator = base.endsWith('/') ? '' : '/';
        uri = `${base}${separator}${DB_Name}?${query}`;
    } else {
        const separator = uri.endsWith('/') ? '' : '/';
        uri = `${uri}${separator}${DB_Name}`;
    }

    try {
        await mongoose.connect(uri);
        console.log("Connected to MongoDB");

        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log("Collections in database:", collections.map(c => c.name));

        const userCount = await db.collection('users').countDocuments();
        const influencerCount = await db.collection('influencers').countDocuments();
        const brandCount = await db.collection('brands').countDocuments();

        console.log(`User Count: ${userCount}`);
        console.log(`Influencer Count: ${influencerCount}`);
        console.log(`Brand Count: ${brandCount}`);

        const influencers = await db.collection('influencers').find({}).toArray();
        console.log("Influencers in DB:");
        influencers.forEach(inf => {
            console.log(`- UserID: ${inf.user}, Username: ${inf.username}`);
        });

        const users = await db.collection('users').find({ role: 'influencer' }).toArray();
        console.log("Users with role 'influencer' in DB:");
        for (const user of users) {
            const inf = influencers.find(i => i.user.toString() === user._id.toString());
            console.log(`- UserID: ${user._id}, Email: ${user.email}, Fullname: ${user.fullname}, HasInfluencerProfile: ${!!inf}`);
            if (!inf) {
                console.log(`  [WARNING] Influencer profile MISSING for user ${user.email}`);
            }
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error("Error:", err);
    }
}

checkDatabase();
