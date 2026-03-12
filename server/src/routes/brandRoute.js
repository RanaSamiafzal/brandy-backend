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
    acceptCollaborationRequest,
    rejectCollaborationRequest,
    getActiveCollaborations,
    getBrandProfile,
    updateBrandProfile,
    changeBrandPassword,
    markActivityStatus,
    deleteNotification,
} from "../controllers/brandController.js";

import { verifyJwt } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

import { upload } from "../middleware/multerMiddleware.js";

const router = Router();

// ✅ All routes require authentication
router.use(verifyJwt);

// ✅ All brand routes require brand role
router.use(roleMiddleware("brand"));

// ----------------- Dashboard -----------------
router.route('/dashboard').get(getBrandDashboard);

// ----------------- Profile Settings -----------------
router.route('/profile').get(getBrandProfile).put(
    upload.fields([
        {
            name: "logo",
            maxCount: 1
        }
    ]),
    updateBrandProfile
);
router.route('/profile/password').patch(changeBrandPassword);
// optional: social links if you implement
// router.route('/profile/social-links').patch(updateSocialLinks);

// ----------------- Activity & Notifications -----------------
router.route('/activities').get(getBrandActivity);
router.route('/activities/:activityId/mark-read').patch(markActivityStatus);
router.route('/activities/:activityId/delete').delete(deleteNotification);

// ----------------- Campaign Routes -----------------
router.route('/campaigns')
    .post(
        upload.fields([
            {
                name: "image",
                maxCount: 1
            }
        ]),
        createCampaign
    )
    .get(getAllCampaigns);

router.route('/campaigns/:campaignId')
    .get(getCampaign)
    .put(updateCampaign)
    .delete(deleteCampaign);

router.route('/campaigns/:campaignId/status')
    .patch(campaignStatus);

// ----------------- Influencer Routes -----------------
router.route('/influencers').get(getAllInfluencer);
router.route('/influencers/:influencerId').get(getInfluencer);

// ----------------- Collaboration Requests -----------------
router.route('/collaboration-requests')
    .post(sendCollaborationRequest)
    .get(getAllCollaborationRequest);

router.route('/collaboration-requests/:requestId')
    .get(getCollaborationRequest);

router.route('/collaboration-requests/:requestId/cancel')
    .patch(cancelCollaborationRequest);

router.route('/collaboration-requests/:requestId/accept')
    .patch(acceptCollaborationRequest);

router.route('/collaboration-requests/:requestId/reject')
    .patch(rejectCollaborationRequest);

// ----------------- Collaboration Hub -----------------
router.route('/collaborations')
    .get(getActiveCollaborations);

export default router;