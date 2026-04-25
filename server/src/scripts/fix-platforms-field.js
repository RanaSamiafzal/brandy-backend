import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected');

    const users = await mongoose.connection.collection('users')
        .find({}, { projection: { email: 1, platforms: 1 } })
        .toArray();

    for (const u of users) {
        const type = typeof u.platforms;
        const isArr = Array.isArray(u.platforms);
        console.log(`  ${u.email} → platforms type: ${type}, isArray: ${isArr}, value: ${JSON.stringify(u.platforms)}`);
    }

    await mongoose.disconnect();
}

run().catch(console.error);
