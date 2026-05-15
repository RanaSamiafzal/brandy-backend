import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { verifyJwt } from '../../middleware/authMiddleware.js';
import { roleMiddleware } from '../../middleware/roleMiddleware.js';
import { validate } from '../../middleware/validationMiddleware.js';
import { adminValidation } from './admin.validation.js';
import { aiIntelligenceController } from '../aiIntelligence/aiIntelligence.controller.js';

const router = Router();

// Webhook for email approvals (no JWT auth header needed, uses URL token)
router.get('/approve-action', adminController.approveAction);

// All other admin routes require a valid JWT + admin role
router.use(verifyJwt);
router.use(roleMiddleware(['admin']));

// Platform overview
router.get('/stats', adminController.getPlatformStats);

// User management
router.get('/users', adminController.getAllUsers);
router.patch('/users/:userId/block', validate(adminValidation.toggleBlockSchema), adminController.toggleBlockUser);

// Safety & moderation
router.get('/messages/scan', adminController.scanMessagesForAbuse);

// Influencer scoring
router.get('/influencers/score/:userId', adminController.getInfluencerBrandyScore);

// Campaign audit
router.get('/campaigns/audit', adminController.auditCampaigns);

// Recent platform activity
router.get('/activity', adminController.getRecentActivity);

// AI Intelligence & Analytics
router.get('/ai/intelligence', aiIntelligenceController.getPlatformIntelligence);
router.get('/ai/recommendations/:brandId', aiIntelligenceController.getBrandRecommendations);

export default router;
