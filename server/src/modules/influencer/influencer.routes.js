import { Router } from "express";
import { influencerController } from "./influencer.controller.js";
import { influencerValidation } from "./influencer.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt);

// Protected dashboard and profile for influencers only
router.get("/dashboard", roleMiddleware(["influencer"]), influencerController.getInfluencerDashboard);
router.get("/profile", roleMiddleware(["influencer"]), influencerController.getInfluencerProfile);

// Dynamic routes must be registered last
router.get("/search", validate(influencerValidation.searchQuerySchema, 'query'), influencerController.getAllInfluencer);
router.get("/:influencerId", influencerController.getInfluencer);

router.patch(
    "/update-profile",
    roleMiddleware(["influencer"]),
    upload.fields([{ name: "profilePicture", maxCount: 1 }, { name: "coverImage", maxCount: 1 }, { name: "resume", maxCount: 1 }]),
    validate(influencerValidation.updateProfileSchema),
    influencerController.updateInfluencerProfile
);

export default router;
