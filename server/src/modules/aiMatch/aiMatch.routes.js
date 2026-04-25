import express from "express";
import { getFiltered, getAiMatchForInfluencer } from "./aiMatch.controller.js";
import { verifyJwt } from "../../middleware/authMiddleware.js";

const router = express.Router();

// Get filtered influencers for AI match (Layer 1)
// We add protect middleware to ensure only logged-in users (brands typically) can access
router.get("/filter/:campaignId", getFiltered);
router.get("/ai-match-influencer/:id", getAiMatchForInfluencer);

export default router;
