import express from "express";
import { getFiltered, getAiMatchForInfluencer } from "./aiMatch.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyJwt);

// Get filtered influencers for AI match (Layer 1)
router.get("/filter/:campaignId", getFiltered);
router.get("/ai-match-influencer/:id", getAiMatchForInfluencer);

export default router;
