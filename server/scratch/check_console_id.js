import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({ path: 'server/.env' });

const run = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const id = '69cbff65c1ead0c476f121f2';
    const user = await mongoose.connection.db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(id) });
    
    if (user) {
        console.log('Found user by ID from console:');
        console.log(JSON.stringify(user, null, 2));
    } else {
        console.log('User NOT found by ID:', id);
        // Try searching as string just in case
        const userStr = await mongoose.connection.db.collection('users').findOne({ _id: id });
        if (userStr) {
            console.log('Found user (string ID):', JSON.stringify(userStr, null, 2));
        }
    }

    await mongoose.disconnect();
};

run().catch(console.error);
