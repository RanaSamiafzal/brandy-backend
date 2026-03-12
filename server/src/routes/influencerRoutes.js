import { Router } from "express";
import {
    getInfluencerDashboard,
    getInfluencerProfile,
    updateInfluencerProfile
} from "../controllers/influencerController.js";
import { verifyJwt } from "../middleware/authMiddleware.js";
import { roleMiddleware } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(verifyJwt);
router.use(roleMiddleware(["influencer"]));

router.route("/dashboard").get(getInfluencerDashboard);
router.route("/profile").get(getInfluencerProfile).patch(updateInfluencerProfile);

export default router;
