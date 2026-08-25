import { Router } from "express";
import { influencerController } from "./influencer.controller.js";
import { influencerValidation } from "./influencer.validation.js";
import { validate } from "../../middleware/validationMiddleware.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";
import { roleMiddleware } from "../../middleware/roleMiddleware.js";
import { upload } from "../../middleware/multerMiddleware.js";

import { verifyAuthOrApiKey } from "../../middleware/apiKeyMiddleware.js";

const router = Router();

// Protected dashboard and profile for influencers only (requires JWT)
router.get("/dashboard", verifyJwt, roleMiddleware(["influencer"]), influencerController.getInfluencerDashboard);
router.get("/profile", verifyJwt, roleMiddleware(["influencer"]), influencerController.getInfluencerProfile);

// Public / Agent accessible read routes
router.get("/search", verifyAuthOrApiKey('influencers:read'), validate(influencerValidation.searchQuerySchema, 'query'), influencerController.getAllInfluencer);
router.get("/:influencerId", verifyAuthOrApiKey('influencers:read'), influencerController.getInfluencer);


router.patch(
    "/update-profile",
    roleMiddleware(["influencer"]),
    upload.fields([
        { name: "profilePicture", maxCount: 1 }, 
        { name: "coverImage", maxCount: 1 }, 
        { name: "resume", maxCount: 1 },
        { name: "portfolioFiles", maxCount: 10 }
    ]),
    validate(influencerValidation.updateProfileSchema),
    influencerController.updateInfluencerProfile
);

export default router;
