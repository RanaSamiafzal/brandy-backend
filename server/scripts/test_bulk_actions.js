import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { collaborationService } from '../src/modules/collaboration/collaboration.service.js';
import Collaboration from '../src/modules/collaboration/collaboration.model.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const testBulkActions = async () => {
    try {
        console.log('Connecting to DB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB successfully.');

        // Find an active collaboration with at least 3 deliverables or create a mock
        let collab = await Collaboration.findOne({ "deliverables.2": { $exists: true } });
        
        if (!collab) {
            console.log('No collaboration found with 3+ deliverables. Creating a mock...');
            collab = await Collaboration.findOne({});
            if (!collab) {
                console.error("No collaboration exists at all in the DB to test with.");
                process.exit(1);
            }
            
            // Add mock deliverables
            collab.deliverables = [
                { title: "Test 1", platform: "instagram", dueDate: new Date(), allocatedBudget: 10, status: "PENDING" },
                { title: "Test 2", platform: "instagram", dueDate: new Date(), allocatedBudget: 10, status: "PENDING" },
                { title: "Test 3", platform: "instagram", dueDate: new Date(), allocatedBudget: 10, status: "PENDING" }
            ];
            await collab.save();
        }

        console.log(`\nTesting bulk actions on Collaboration ID: ${collab._id}`);
        const deliverableIds = collab.deliverables.slice(0, 3).map(d => d._id);
        
        console.log('\n--- Test 1: Bulk Start (PENDING -> IN_PROGRESS) ---');
        await Promise.all(deliverableIds.map(id => collaborationService.updateDeliverable(collab._id, id, collab.influencer, { status: "IN_PROGRESS" })));
        
        const collabAfterStart = await Collaboration.findById(collab._id);
        const startedCount = collabAfterStart.deliverables.filter(d => deliverableIds.includes(d._id) && d.status === "IN_PROGRESS").length;
        if (startedCount === 3) console.log('✅ Bulk Start Passed');
        else console.error(`❌ Bulk Start Failed. Expected 3, got ${startedCount}`);

        console.log('\n--- Test 2: Bulk Submit (IN_PROGRESS -> SUBMITTED) ---');
        await Promise.all(deliverableIds.map(id => collaborationService.submitDeliverable(collab._id, id, collab.influencer, { submissionFiles: ["http://test.com"] })));

        const collabAfterSubmit = await Collaboration.findById(collab._id);
        const submittedCount = collabAfterSubmit.deliverables.filter(d => deliverableIds.includes(d._id) && d.status === "SUBMITTED").length;
        if (submittedCount === 3) console.log('✅ Bulk Submit Passed');
        else console.error(`❌ Bulk Submit Failed. Expected 3, got ${submittedCount}`);

        console.log('\n--- Test 3: Bulk Delete (Cleaning up mock) ---');
        await Promise.all(deliverableIds.map(id => collaborationService.deleteDeliverable(collab._id, id, collab.brand)));

        const collabAfterDelete = await Collaboration.findById(collab._id);
        const remainingCount = collabAfterDelete.deliverables.filter(d => deliverableIds.includes(d._id)).length;
        if (remainingCount === 0) console.log('✅ Bulk Delete Passed');
        else console.error(`❌ Bulk Delete Failed. Expected 0, got ${remainingCount}`);

    } catch (error) {
        console.error('Test script failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from DB.');
        process.exit(0);
    }
};

testBulkActions();
