import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Collaboration } from './server/src/modules/collaboration/collaboration.model.js';
import Campaign from './server/src/modules/campaign/campaign.model.js';

dotenv.config({ path: './server/.env' });

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected");
    
    const docs = await Collaboration.find({}).limit(2);
    console.log("Collabs:", docs.map(d => ({id: d._id, campaign: d.campaign})));
    
    if (docs.length > 0) {
        const camp = await Campaign.findById(docs[0].campaign);
        console.log("Campaign exists?", !!camp);
    }
    
    // Test the specific lookup
    const aggr = await Collaboration.aggregate([
        { $limit: 2 },
        {
            $lookup: {
                from: "campaigns",
                localField: "campaign",
                foreignField: "_id",
                as: "campaignDetails"
            }
        },
        { $unwind: { path: "$campaignDetails", preserveNullAndEmptyArrays: true } }
    ]);
    console.log("Aggr result length:", aggr.length);
    if(aggr.length > 0) {
        console.log("Has campaignDetails?", !!aggr[0].campaignDetails);
        if (aggr[0].campaignDetails) console.log("Campaign Name:", aggr[0].campaignDetails.name);
    }

    process.exit(0);
}
run();
