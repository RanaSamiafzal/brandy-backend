import Influencer from "../influencer/influencer.model.js";
import Campaign from "../campaign/campaign.model.js";
import Collaboration from "../collaboration/collaboration.model.js";
import Brand from "../brand/brand.model.js";

const escapeRegex = (string) => {
  if (typeof string !== 'string') return "";
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const getFilteredInfluencers = async (campaign) => {
  try {
    const escapedIndustry = escapeRegex(campaign.industry || "");
    const escapedPlatforms = (campaign.platform || []).map(p => escapeRegex(p));
    
    // 1. Primary Query - Improved with Case-Insensitive Regex
    const query = {
      category: { $regex: new RegExp(`^${escapedIndustry}$`, 'i') }, 
      "platforms.name": { 
        $in: escapedPlatforms.map(p => new RegExp(`^${p}$`, 'i')) 
      }
    };

    // 2. Budget Fit (Simplified for Layer 1 to ensure results)
    // We check this in Layer 2 (Scoring) instead of hard-filtering in Layer 1 
    // unless the user has many influencers. Keeping Layer 1 broad for now.

    let influencers = await Influencer.find(query).limit(50).populate("user", "fullname profilePic isVerified verifiedPlatforms").lean();

    // 3. Robust Fallback Strategy
    if (influencers.length === 0) {
      // Fallback 1: Just match category (ignore platform)
      influencers = await Influencer.find({
        category: { $regex: new RegExp(`^${escapedIndustry}$`, 'i') }
      }).limit(50).populate("user", "fullname profilePic isVerified verifiedPlatforms").lean();
      
      // Fallback 2: Just match platform (ignore category)
      if (influencers.length === 0) {
        influencers = await Influencer.find({
          "platforms.name": { 
            $in: escapedPlatforms.map(p => new RegExp(`^${p}$`, 'i')) 
          }
        }).limit(50).populate("user", "fullname profilePic isVerified verifiedPlatforms").lean();
      }
      
      // Fallback 3: Return latest influencers (last resort)
      if (influencers.length === 0) {
        influencers = await Influencer.find({ isAvailable: true }).sort({ createdAt: -1 }).limit(10).lean();
      }
    }

    return influencers;
  } catch (err) {
    console.error("Filter Error:", err);
    throw err;
  }
};

export const getMatchedCampaigns = async (influencer) => {
  try {
    const escapedCategory = escapeRegex(influencer.category || "");
    const query = {
      status: 'active',
      isDeleted: false,
      industry: { $regex: new RegExp(`^${escapedCategory}$`, 'i') }
    };

    let campaigns = await Campaign.find(query).limit(50).populate("brand", "fullname profilePic isVerified verifiedPlatforms").lean();

    // Map brand to brandUser for frontend consistency
    campaigns = await Promise.all(campaigns.map(async (c) => {
      const brandProfile = await Brand.findOne({ user: c.brand?._id || c.brand }).lean();
      return { 
        ...c, 
        brandUser: c.brand, 
        brandProfile 
      };
    }));

    if (campaigns.length === 0) {
      const infPlatforms = (influencer.platforms || []).map(p => p?.name).filter(Boolean);
      let foundCampaigns = await Campaign.find({
        status: 'active',
        isDeleted: false,
        platform: { $in: infPlatforms }
      }).limit(30).populate("brand", "fullname profilePic isVerified verifiedPlatforms").lean();

      campaigns = await Promise.all(foundCampaigns.map(async (c) => {
        const brandProfile = await Brand.findOne({ user: c.brand?._id || c.brand }).lean();
        return { 
          ...c, 
          brandUser: c.brand, 
          brandProfile 
        };
      }));
    }

    if (campaigns.length === 0) {
        let latestCampaigns = await Campaign.find({ status: 'active', isDeleted: false })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("brand", "fullname profilePic isVerified verifiedPlatforms")
          .lean();

        campaigns = await Promise.all(latestCampaigns.map(async (c) => {
          const brandProfile = await Brand.findOne({ user: c.brand?._id || c.brand }).lean();
          return { 
            ...c, 
            brandUser: c.brand, 
            brandProfile 
          };
        }));
    }

    // Fetch influencer's collaboration history for scoring boost
    const history = await Collaboration.find({ 
      influencer: influencer.user, 
      status: 'completed' 
    }).populate("campaign", "industry").lean();

    return { campaigns, history };
  } catch (err) {
    console.error("getMatchedCampaigns Error:", err);
    throw err;
  }
};

export const getMatchedBrands = async (influencer) => {
  try {
    const escapedCategory = escapeRegex(influencer.category || "");
    // 1. Fetch brands in the same industry
    let brandsRaw = await Brand.find({
      industry: { $regex: new RegExp(`^${escapedCategory}$`, 'i') }
    }).limit(50).populate("user", "fullname profilePic isVerified verifiedPlatforms").lean();

    // Flatten user into root for frontend consistency (isVerified, verifiedPlatforms)
    let brands = brandsRaw.map(b => ({
        ...b,
        fullname: b.user?.fullname,
        profilePic: b.user?.profilePic,
        isVerified: b.user?.isVerified,
        verifiedPlatforms: b.user?.verifiedPlatforms
    }));

    // 2. Fallback: Brands with active campaigns in the same industry
    if (brands.length < 5) {
      const activeCampaignBrands = await Campaign.find({
        status: 'active',
        industry: { $regex: new RegExp(`^${escapedCategory}$`, 'i') }
      }).distinct("brand");
      
      const additionalBrandsRaw = await Brand.find({
        user: { $in: activeCampaignBrands, $nin: brands.map(b => b.user?._id || b.user).filter(Boolean) }
      }).limit(20).populate("user", "fullname profilePic isVerified verifiedPlatforms").lean();
      
      const additionalBrands = additionalBrandsRaw.map(b => ({
        ...b,
        fullname: b.user?.fullname,
        profilePic: b.user?.profilePic,
        isVerified: b.user?.isVerified,
        verifiedPlatforms: b.user?.verifiedPlatforms
      }));
      
      brands = [...brands, ...additionalBrands];
    }

    // 3. Last resort: top rated brands
    if (brands.length === 0) {
      const topBrandsRaw = await Brand.find({}).sort({ rating: -1 }).limit(10).populate("user", "fullname profilePic isVerified verifiedPlatforms").lean();
      brands = topBrandsRaw.map(b => ({
        ...b,
        fullname: b.user?.fullname,
        profilePic: b.user?.profilePic,
        isVerified: b.user?.isVerified,
        verifiedPlatforms: b.user?.verifiedPlatforms
      }));
    }

    // 4. Fetch ALL collaboration history for cultural fit scoring AND status display
    const allCollaborations = await Collaboration.find({
      influencer: influencer.user,
      isDeleted: false
    }).populate("campaign", "name title").lean();

    // Split: completed ones for scoring, all for status display
    const history = allCollaborations.filter(c => c.status === 'completed');

    // Build per-brand collaboration status map
    // Priority: active/in_progress > review > completed > cancelled
    const brandCollabMap = {};
    for (const collab of allCollaborations) {
      const brandId = String(collab.brand);
      const existing = brandCollabMap[brandId];
      // Keep the highest-priority status per brand
      const priority = { active: 4, in_progress: 3, review: 2, completed: 1, cancelled: 0 };
      if (!existing || (priority[collab.status] || 0) > (priority[existing.status] || 0)) {
        brandCollabMap[brandId] = {
          collaborationId: String(collab._id),
          status: collab.status,
          campaignName: collab.campaign?.name || collab.campaign?.title || collab.title || 'Collaboration'
        };
      }
    }

    return { brands, history, brandCollabMap };
  } catch (err) {
    console.error("getMatchedBrands Error:", err);
    throw err;
  }
};
