import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Collaboration from '../modules/collaboration/collaboration.model.js';
import User from '../modules/user/user.model.js';
import Campaign from '../modules/campaign/campaign.model.js';
import { stripeService } from '../modules/payment/stripe.service.js';

dotenv.config({ path: './.env' });
if (!process.env.STRIPE_SECRET_KEY) {
    dotenv.config({ path: './server/.env' });
}

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("✅ Connected to MongoDB");

        // 1. Setup Mock Data
        const brand = await User.findOne({ role: 'brand' });
        const influencer = await User.findOne({ role: 'influencer' });
        
        if (!brand || !influencer) {
            console.error("❌ Need at least one brand and one influencer in DB");
            process.exit(1);
        }

        // Ensure influencer has a mock stripe account for testing
        if (!influencer.stripeAccountId) {
            influencer.stripeAccountId = 'acct_mock_test';
            await influencer.save();
            console.log("🛠️ Added mock stripeAccountId to influencer");
        }

        const campaign = await Campaign.create({
            name: "Test Stripe Campaign",
            description: "Testing end-to-end payment flow",
            brand: brand._id,
            budget: 100,
            status: 'active'
        });

        const collaboration = await Collaboration.create({
            brand: brand._id,
            influencer: influencer._id,
            campaign: campaign._id,
            title: "Test Collab",
            agreedBudget: 100,
            status: "awaiting_funds",
            deliverables: [{
                title: "Test Video",
                description: "Upload a video",
                type: "video"
            }]
        });

        console.log(`🚀 Created Collab: ${collaboration._id} (Status: ${collaboration.status})`);

        // 2. Simulate Webhook (Escrow Funded)
        console.log("🔔 Simulating Webhook: checkout.session.completed...");
        await stripeService.handleEscrowFunded({
            payment_intent: "pi_mock_test",
            metadata: {
                collaborationId: collaboration._id.toString(),
                type: 'escrow_funding'
            }
        });

        const activeCollab = await Collaboration.findById(collaboration._id);
        console.log(`✅ Collab Status after Webhook: ${activeCollab.status} (Escrow Funded: ${activeCollab.escrowFunded})`);

        // 3. Simulate Deliverable Payout
        const deliverableId = activeCollab.deliverables[0]._id;
        console.log(`💸 Simulating Payout for Deliverable: ${deliverableId}...`);
        
        // Mock the stripe.transfers.create in stripe.service.js if needed, 
        // but for now we expect it to fail or use sk_test with real mock acct
        try {
            await stripeService.transferDeliverablePayout(activeCollab._id, deliverableId);
            const paidCollab = await Collaboration.findById(activeCollab._id);
            console.log(`✅ Deliverable Payment Status: ${paidCollab.deliverables[0].paymentStatus}`);
        } catch (e) {
            console.warn("⚠️ Payout transfer failed (expected if acct_mock_test is invalid):", e.message);
        }

        console.log("🏁 Test Finished");
        process.exit(0);
    } catch (error) {
        console.error("❌ Test Error:", error);
        process.exit(1);
    }
};

runTest();
