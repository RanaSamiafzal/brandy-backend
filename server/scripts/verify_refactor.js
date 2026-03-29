import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { campaignService } from '../src/modules/campaign/campaign.service.js';
import Campaign from '../src/modules/campaign/campaign.model.js';

dotenv.config();

const testVerification = async () => {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected successfully.");

        // Clean up any existing test data
        await Campaign.deleteMany({ name: /^TEST_/ });

        const testBrandId = new mongoose.Types.ObjectId();

        // 1. Test status logic
        console.log("\nTesting status logic...");
        const now = new Date();
        const futureDate = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7); // 7 days later
        const pastDate = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7); // 7 days ago

        const pendingCampaign = await campaignService.createCampaign({
            name: "TEST_Pending",
            industry: "Tech",
            platform: ["instagram"],
            budget: { min: 100, max: 500 },
            startDate: futureDate,
            endDate: new Date(futureDate.getTime() + 86400000),
            brand: testBrandId
        });
        console.log(`Pending Campaign Status: ${pendingCampaign.status} (Expected: pending)`);

        const activeCampaign = await campaignService.createCampaign({
            name: "TEST_Active Campaign",
            industry: "Fashion",
            platform: ["tiktok"],
            budget: { min: 200, max: 1000 },
            startDate: pastDate,
            endDate: futureDate,
            brand: testBrandId
        });
        console.log(`Active Campaign Status: ${activeCampaign.status} (Expected: active)`);

        const completedCampaign = await campaignService.createCampaign({
            name: "TEST_Completed",
            industry: "Food",
            platform: ["youtube"],
            budget: { min: 300, max: 1500 },
            startDate: new Date(pastDate.getTime() - 86400000),
            endDate: pastDate,
            brand: testBrandId
        });
        console.log(`Completed Campaign Status: ${completedCampaign.status} (Expected: completed)`);

        // 2. Test search and filtering
        console.log("\nTesting search and filtering...");
        // Wait for index to be created (mongoose might need a moment)
        await Campaign.ensureIndexes();

        const searchResult = await campaignService.getAllCampaigns({ 
            brand: testBrandId, 
            search: "Active" 
        });
        console.log(`Search result for "Active": Found ${searchResult.campaigns.length} campaigns (Expected: 1)`);

        const statusResult = await campaignService.getAllCampaigns({ 
            brand: testBrandId, 
            status: "pending" 
        });
        console.log(`Filter result for "pending": Found ${statusResult.campaigns.length} campaigns (Expected: 1)`);

        // 3. Test service update logic
        console.log("\nTesting update logic...");
        const updated = await campaignService.updateCampaign(activeCampaign._id, { name: "TEST_Active Updated" });
        console.log(`Updated Name: ${updated.name} (Expected: TEST_Active Updated)`);

        console.log("\nVerification completed successfully!");

    } catch (error) {
        console.error("Verification failed:", error);
    } finally {
        await mongoose.connection.close();
    }
};

testVerification();
