import express from 'express';
import { stripeController } from './stripe.controller.js';
import { verifyJwt } from '../../middleware/authMiddleware.js';
import { roleMiddleware } from '../../middleware/roleMiddleware.js';

const router = express.Router();

// Public webhook route is handled in app.js for express.raw support
// router.post('/webhook', stripeController.stripeWebhook);

// Protected routes
router.use(verifyJwt);

// History (Shared)
router.get('/history', stripeController.getPaymentHistory);

// Brand: Fund Escrow & Card Management
router.post('/escrow/fund', roleMiddleware("brand"), stripeController.fundEscrow);
router.post('/escrow/sync', roleMiddleware("brand"), stripeController.syncEscrowStatus);
router.get('/methods', roleMiddleware("brand"), stripeController.getPaymentMethods);
router.post('/methods/setup', roleMiddleware("brand"), stripeController.createSetupIntent);
router.delete('/methods/:id', roleMiddleware("brand"), stripeController.removePaymentMethod);

// Deliverable Actions
// :id is deliverableId
router.post('/deliverable/:id/start', roleMiddleware("influencer"), stripeController.startDeliverable);
router.post('/deliverable/:id/submit', roleMiddleware("influencer"), stripeController.submitDeliverable);
router.post('/deliverable/:id/approve', roleMiddleware("brand"), stripeController.approveDeliverable);

// Influencer: Connect Onboarding
router.post('/connect/onboard', roleMiddleware("influencer"), stripeController.onboardConnect);

export default router;
