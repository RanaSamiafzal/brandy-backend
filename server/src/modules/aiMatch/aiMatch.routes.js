import express from "express";
import { getFiltered, getAiMatchForInfluencer } from "./aiMatch.controller.js";
import { verifyAuthOrApiKey } from "../../middleware/apiKeyMiddleware.js";

const router = express.Router();

// Get filtered influencers for AI match (Layer 1)
router.get("/filter/:campaignId", verifyAuthOrApiKey('aimatch:read'), getFiltered);
router.get("/ai-match-influencer/:id", verifyAuthOrApiKey('aimatch:read'), getAiMatchForInfluencer);

export default router;

