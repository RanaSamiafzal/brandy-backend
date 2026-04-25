/**
 * LAYER 3: AI Match Ranking & Formatting Service
 * Pure deterministic formatting and sorting logic. NO DB. NO LLMs.
 */

// Helper to determine Trust Level
const getTrustLevel = (influencer) => {
  const isVerified = influencer.user?.isVerified || influencer.isVerified;
  const hasPlatform = influencer.platforms && influencer.platforms.length > 0;
  
  if (isVerified) return "High";
  if (hasPlatform) return "Medium";
  return "Low";
};

// Helper for generic Verification flag
const checkIsVerified = (influencer) => {
  return influencer.user?.isVerified || influencer.isVerified || false;
};

// Map Match Levels
const getMatchLevel = (score) => {
  if (score >= 85) return "Excellent Match";
  if (score >= 70) return "Good Match";
  if (score >= 50) return "Moderate Match";
  return "Low Match";
};

export const formatAndRankInfluencers = (scoredInfluencers) => {
  // Edge Case 1: No influencers handed from Layer 2
  if (!scoredInfluencers || scoredInfluencers.length === 0) {
    return [];
  }

  // 1. Sort Influencers
  const rankedInfluencers = [...scoredInfluencers].sort((a, b) => {
    // Descending by score
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // Edge Case 2: Tie Break (Similar scores)
    
    // a. Prioritize verified profiles first
    const aVerified = checkIsVerified(a.influencer);
    const bVerified = checkIsVerified(b.influencer);
    if (aVerified && !bVerified) return -1;
    if (!aVerified && bVerified) return 1;

    // b. Prioritize profile completeness
    // Check bio length and cover Image
    const aCompleteness = 
      (a.influencer.about ? a.influencer.about.length : 0) + 
      (a.influencer.coverImage ? 10 : 0);
    const bCompleteness = 
      (b.influencer.about ? b.influencer.about.length : 0) + 
      (b.influencer.coverImage ? 10 : 0);
      
    return bCompleteness - aCompleteness;
  });

  // 2. Select top 20
  const topInfluencers = rankedInfluencers.slice(0, 20);

  // 3 & 4. Format Output Payload
  const formattedResults = topInfluencers.map(item => {
    const inf = item.influencer;
    
    // Attempting safely fallback to nested user schema if hydrated
    const name = inf.fullname || (inf.user && inf.user.fullname) || inf.username;
    const profileImage = inf.coverImage || (inf.user && inf.user.profilePic) || "";

    return {
      id: inf._id,
      name: name,
      username: inf.username,
      profileImage: profileImage,
      matchScore: item.score,
      matchLevel: getMatchLevel(item.score),
      reasons: item.reasons,
      platforms: inf.platforms || [],
      isVerified: checkIsVerified(inf),
      verifiedPlatforms: inf.user?.verifiedPlatforms || inf.verifiedPlatforms || {},
      trustLevel: getTrustLevel(inf)
    };
  });

  return formattedResults;
};

export const formatAndRankCampaigns = (scoredCampaigns) => {
  if (!scoredCampaigns || scoredCampaigns.length === 0) {
    return [];
  }

  const ranked = [...scoredCampaigns].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 20);

  return top.map(item => {
    const c = item.campaign;
    return {
      campaign: c,
      matchScore: item.score,
      matchLevel: getMatchLevel(item.score),
      reason: item.reasons[0], // Providing the top reason
      reasons: item.reasons
    };
  });
};

export const formatAndRankBrands = (scoredBrands, brandCollabMap = {}) => {
  if (!scoredBrands || scoredBrands.length === 0) return [];

  // Helper to generate a human-readable collaboration label
  const getCollabLabel = (status) => {
    switch (status) {
      case 'active':
      case 'in_progress':
      case 'review':
        return 'Ongoing';
      case 'completed':
        return 'Previously Worked';
      case 'cancelled':
        return 'Cancelled';
      default:
        return null;
    }
  };

  return scoredBrands
    .map((item) => {
      const { brand, score, reasons } = item;
      const brandUserId = String(brand.user?._id || brand.user || '');
      const brandDocId = String(brand._id || '');
      
      // Check both brand doc ID and user ID since collaborations store user IDs
      const collabInfo = brandCollabMap[brandUserId] || brandCollabMap[brandDocId] || null;

      return {
        brand,
        matchScore: score,
        matchLevel: getMatchLevel(score),
        reasons: reasons,
        matchType: "Brand Synergy",
        collaborationStatus: collabInfo ? {
          status: collabInfo.status,
          label: getCollabLabel(collabInfo.status),
          collaborationId: collabInfo.collaborationId,
          campaignName: collabInfo.campaignName,
        } : null
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 20);
};
