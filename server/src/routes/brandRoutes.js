import { Router } from "express";
import {
    getBrandDashboard,
    getBrandProfile,
    updateBrandProfile,
    changeBrandPassword,
    getBrandActivity,
    markActivityStatus,
    deleteNotification
} from "../controllers/brandController.js";
import {
    getAllInfluencer,
    getInfluencer as getInfluencerDetail
} from "../controllers/influencerController.js";
import { verifyJwt } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";
import { upload } from "../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt);
router.use(roleMiddleware(["brand"]));

router.route("/dashboard").get(getBrandDashboard);
router.route("/profile").get(getBrandProfile).patch(upload.fields([{ name: "logo", maxCount: 1 }]), updateBrandProfile);
router.route("/change-password").post(changeBrandPassword);
router.route("/activity").get(getBrandActivity);
router.route("/activity/:activityId/read").patch(markActivityStatus);
router.route("/activity/:activityId").delete(deleteNotification);

// Influencer Search (Brand perspective)
router.route("/influencers").get(getAllInfluencer);
router.route("/influencers/:influencerId").get(getInfluencerDetail);

export default router;
