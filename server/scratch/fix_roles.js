import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Fix roles: entrepreneur -> brand, investor -> influencer
    const r1 = await mongoose.connection.db.collection('users').updateMany(
        { role: 'entrepreneur' },
        { $set: { role: 'brand' } }
    );
    console.log(`Updated ${r1.modifiedCount} entrepreneur(s) -> brand`);

    const r2 = await mongoose.connection.db.collection('users').updateMany(
        { role: 'investor' },
        { $set: { role: 'influencer' } }
    );
    console.log(`Updated ${r2.modifiedCount} investor(s) -> influencer`);

    // Verify
    const users = await mongoose.connection.db.collection('users')
        .find({})
        .project({ fullname: 1, email: 1, role: 1 })
        .toArray();
    console.log('Updated users:');
    users.forEach(u => console.log(JSON.stringify(u)));

    await mongoose.disconnect();
};

run().catch(console.error);
