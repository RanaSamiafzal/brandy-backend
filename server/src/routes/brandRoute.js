import { Router } from "express";
import {
    getBrandActivity,
    getBrandDashboard,
    createCampaign,
    getAllCampaigns,
    getCampaign,
    updateCampaign,
    deleteCampaign,
    campaignStatus,
    getAllInfluencer,
    getInfluencer,
    sendCollaborationRequest,
    getAllCollaborationRequest,
    getCollaborationRequest,
    cancelCollaborationRequest,
    getBrandProfile,
    updateBrandProfile,
    changeBrandPassword,
    updateSocialLinks,
    getBrandNotification,
    markActivityStatus,
    deleteNotification,
} from "../controllers/brandController.js";
import { verifyJwt } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = Router();

// All routes require authentication
router.use(verifyJwt);

// All brand routes require brand role
router.use(roleMiddleware("brand"));

// Dashboard routes
router.route('/dashboard').get(getBrandDashboard);

// Activity/Notification routes
router.route('/activities').get(getBrandActivity);

// Campaign routes
router.route('/campaigns')
    .post(createCampaign)
    .get(getAllCampaigns);

// Single campaign routes
router.route('/campaigns/:campaignId')
    .get(getCampaign)
    .put(updateCampaign)
    .delete(deleteCampaign);

// Campaign status update
router.route('/campaigns/:campaignId/status')
    .patch(campaignStatus);

// Influencer routes
router.route('/influencers').get(getAllInfluencer);
router.route('/influencers/:influencerId').get(getInfluencer);

// Collaboration Request routes
router.route('/collaboration-requests')
    .post(sendCollaborationRequest)
    .get(getAllCollaborationRequest);

router.route('/collaboration-requests/:requestId').get(getCollaborationRequest);
router.route('/collaboration-requests/:requestId/cancel').patch(cancelCollaborationRequest);

export default router;



