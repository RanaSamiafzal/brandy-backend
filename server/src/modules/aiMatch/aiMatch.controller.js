import { getFilteredInfluencers, getMatchedCampaigns, getMatchedBrands } from "./aiMatch.service.js";
import { scoreInfluencers, scoreCampaigns, scoreBrands } from "./aiMatch.scorer.js";
import { formatAndRankInfluencers, formatAndRankCampaigns, formatAndRankBrands } from "./aiMatch.formatter.js";
import Influencer from "../influencer/influencer.model.js";
import Campaign from "../campaign/campaign.model.js";

export const getFiltered = async (req, res) => {
  try {
    const { campaignId } = req.params;
    
    // Find campaign to extract filter criteria
    const campaign = await Campaign.findById(campaignId).lean();
    if (!campaign) {
      return res.status(404).json({ success: false, error: "Campaign not found" });
    }

    // Layer 1: Filter efficiently
    const influencers = await getFilteredInfluencers(campaign);

    // Layer 2: Mathematical Scoring
    const scoredInfluencers = scoreInfluencers(influencers, campaign);

    // Layer 3: Formatting & Ranking UI constraints
    const responsePayload = formatAndRankInfluencers(scoredInfluencers);

    // Special handler for empty array edge case handled inside formatter
    if (!Array.isArray(responsePayload)) {
       return res.status(200).json({
          success: true,
          count: 0,
          data: responsePayload
       });
    }

    return res.status(200).json({
      success: true,
      count: responsePayload.length,
      data: responsePayload,
    });
  } catch (err) {
    console.error("aiMatch Controller Error:", err);
    return res.status(500).json({ success: false, error: "Filtering failed" });
  }
};

export const getAiMatchForInfluencer = async (req, res) => {
  try {
    const { id: userId } = req.params;
    const { type = 'campaigns' } = req.query;
    
    // 1. Find Influencer profile
    const influencer = await Influencer.findOne({ user: userId }).lean();
    if (!influencer) {
      return res.status(404).json({ success: false, error: "Influencer profile not found" });
    }

    if (type === 'brands') {
      // BRAND MATCHING logic
      const { brands, history, brandCollabMap } = await getMatchedBrands(influencer);
      const scoredBrands = scoreBrands(brands, influencer, history);
      const responsePayload = formatAndRankBrands(scoredBrands, brandCollabMap);

      return res.status(200).json({
        success: true,
        count: Array.isArray(responsePayload) ? responsePayload.length : 0,
        data: responsePayload,
      });
    }

    // DEFAULT: CAMPAIGN MATCHING logic
    // 2. Layer 1: Filter Campaigns
    const { campaigns, history } = await getMatchedCampaigns(influencer);

    // 3. Layer 2: Scoring
    const scoredCampaigns = scoreCampaigns(campaigns, influencer, history);

    // 4. Layer 3: Formatting & Ranking
    const responsePayload = formatAndRankCampaigns(scoredCampaigns);

    return res.status(200).json({
      success: true,
      count: Array.isArray(responsePayload) ? responsePayload.length : 0,
      data: responsePayload,
    });
  } catch (err) {
    console.error("getAiMatchForInfluencer Controller Error:", err);
    return res.status(500).json({ success: false, error: "Matching failed", message: err.message, stack: err.stack });
  }
};
