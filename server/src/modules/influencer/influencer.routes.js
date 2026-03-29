import { Router } from "express";
import { influencerController } from "./influencer.controller.js";
import { influencerValidation } from "./influencer.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

const router = Router();

router.use(verifyJwt);

// Public search and single view for authenticated users
router.get("/search", validate(influencerValidation.searchQuerySchema, 'query'), influencerController.getAllInfluencer);
router.get("/:influencerId", influencerController.getInfluencer);

// Protected dashboard and profile for influencers only
router.get("/dashboard", roleMiddleware(["influencer"]), influencerController.getInfluencerDashboard);
router.get("/profile", roleMiddleware(["influencer"]), influencerController.getInfluencerProfile);

router.patch(
    "/update-profile",
    roleMiddleware(["influencer"]),
    upload.fields([{ name: "profilePicture", maxCount: 1 }]),
    validate(influencerValidation.updateProfileSchema),
    influencerController.updateInfluencerProfile
);

export default router;
