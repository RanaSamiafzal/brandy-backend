/**
 * LAYER 2: AI Match Scoring Service
 * Pure deterministic mathematical evaluation function. NO DB. NO LLMs.
 */

const NicheSynonyms = {
  fashion: ["apparel", "clothing", "style", "beauty", "model"],
  tech: ["technology", "software", "hardware", "gaming", "gadgets"],
  fitness: ["health", "workout", "gym", "wellness", "sports"],
  food: ["culinary", "restaurant", "cooking", "diet"],
  lifestyle: ["travel", "vlog", "daily", "general"]
};

// Goals -> Content Types
// Basic mapping to see if influencer offers the right service for campaign goals
const GoalContentMap = {
  awareness: ["post", "reel", "story", "shoutout", "vlog", "video"],
  sales: ["review", "tutorial", "unboxing", "promo", "integrated"],
  traffic: ["link", "story", "swipe up", "feature"],
  creation: ["photoshoot", "user generated", "ugc", "design"]
};

// Map platform to expected primary content formats to check 'intent' match
const PlatformIntentMap = {
  instagram: ["post", "reel", "story", "carousel"],
  youtube: ["video", "vlog", "integrated", "dedicated", "short"],
  tiktok: ["video", "trend", "sound", "challenge"],
  twitter: ["tweet", "thread", "retweet", "promo"],
  facebook: ["post", "video", "live"],
  linkedin: ["article", "post", "professional"]
};

export const scoreInfluencers = (influencers, campaign) => {
  return influencers.map((influencer) => {
    let reasons = [];
    
    // ==========================================
    // 1. Niche Match Score (40% Weight)
    // ==========================================
    let nicheScore = 40; // Default weak match if somehow nothing hits
    const campaignIndustry = (campaign.industry || "").toLowerCase();
    const infCategory = (influencer.category || "").toLowerCase();

    if (campaignIndustry && campaignIndustry === infCategory) {
      nicheScore = 100;
      reasons.push(`Perfect category match (${infCategory})`);
    } else if (campaignIndustry) {
      let foundSynonym = false;
      for (const [key, related] of Object.entries(NicheSynonyms)) {
        if (
          (key === campaignIndustry && related.includes(infCategory)) ||
          (related.includes(campaignIndustry) && related.includes(infCategory)) ||
          (key === infCategory && related.includes(campaignIndustry))
        ) {
          nicheScore = 80;
          reasons.push(`Closely related to ${campaignIndustry}`);
          foundSynonym = true;
          break;
        }
      }
      if (!foundSynonym) {
        nicheScore = 60; // Broad match baseline fallback
        reasons.push("Broad industry overlap");
      }
    }

    // Extract all services and content types across platforms for easier querying below
    const allServices = (influencer.platforms || []).flatMap((p) => p.services || []);
    const allContentTypes = allServices.map(s => (s.contentType || "").toLowerCase());
    const lowestPrice = allServices.reduce((min, s) => {
      return (s.price !== undefined && s.price < min) ? s.price : min;
    }, Infinity);

    // ==========================================
    // 2. Content Type Match (20% Weight)
    // ==========================================
    let contentScore = 50; // Baseline assumed
    const cGoals = (campaign.goals || []).map(g => (g || "").toLowerCase());
    
    // Check if the influencer provides content types that align with the campaign's goals
    let hasGoalAlignment = false;
    for (const goal of cGoals) {
      if (!goal) continue;
      // Very basic keyword matching for 'awareness', 'sales', etc
      for (const [key, expectedTypes] of Object.entries(GoalContentMap)) {
        if (goal.includes(key)) {
          if (expectedTypes.some(t => allContentTypes.some(c => c.includes(t)))) {
            hasGoalAlignment = true;
          }
        }
      }
    }

    if (hasGoalAlignment) {
      contentScore = 100;
      reasons.push("Content style tightly aligns with campaign goals");
    } else if (allContentTypes.some(c => c && cGoals.some(g => g && g.includes(c)))) {
      // Direct string overlap between goals and content type naming
      contentScore = 80;
      reasons.push("Content formats directly meet campaign needs");
    } else {
      contentScore = 60; // Generic fallback
    }

    // ==========================================
    // 3. Platform Intent Match (15% Weight)
    // ==========================================
    let platformScore = 60;
    let intentMatch = false;

    // campaign.platform is an array
    const requiredPlatforms = (campaign.platform || []).map(p => (p || "").toLowerCase());
    
    for (const plat of requiredPlatforms) {
      if (!plat) continue;
      const expectedIntent = PlatformIntentMap[plat] || [];
      // Do they have services on this platform matching standard intents?
      const specificPlat = (influencer.platforms || []).find(p => (p.name || "").toLowerCase() === plat);
      if (specificPlat) {
        const platServices = (specificPlat.services || []).map(s => (s.contentType || "").toLowerCase());
        if (expectedIntent.some(intent => platServices.some(ps => ps.includes(intent)))) {
          intentMatch = true;
          break;
        }
      }
    }

    if (intentMatch) {
      platformScore = 100;
      reasons.push("Platform and primary content formats align perfectly");
    } else {
      platformScore = 60;
    }

    // ==========================================
    // 4. Budget Fit (15% Weight)
    // ==========================================
    let budgetScore = 0;
    const maxBudget = campaign.budget?.max || 0;

    if (maxBudget > 0 && lowestPrice !== Infinity) {
      if (lowestPrice <= maxBudget) {
        budgetScore = 100;
        reasons.push("Pricing fits well within budget");
      } else if (lowestPrice <= maxBudget * 1.1) {
        budgetScore = 80;
        reasons.push("Slightly below/above acceptable budget threshold");
      } else if (lowestPrice <= maxBudget * 1.5) {
        budgetScore = 50;
        // Don't add a positive reason for this
      } else {
        budgetScore = 0;
      }
    } else {
      // If none defined, neutral baseline
      budgetScore = 50; 
    }

    // ==========================================
    // 5. Profile Quality (10% Weight)
    // ==========================================
    let qualityScore = 0;
    if (influencer.about && influencer.about.trim().length > 10) qualityScore += 30; // has bio
    if (influencer.coverImage || (influencer.user && influencer.user.profilePic)) qualityScore += 30; // has image
    if (influencer.platforms && influencer.platforms.length > 0) qualityScore += 40; // has verified platform(s) mapping

    if (qualityScore >= 80) {
      // We don't always need to flood reasons, cap it if we already have 3
      if (reasons.length < 4) {
        reasons.push("High profile completeness and verified presence");
      }
    }

    // ==========================================
    // FINAL AGGREGATION
    // ==========================================
    const finalScore = (
      nicheScore * 0.4 +
      contentScore * 0.2 +
      platformScore * 0.15 +
      budgetScore * 0.15 +
      qualityScore * 0.1
    );

    // Trim reasons max 4 to keep it clean
    reasons = reasons.slice(0, 4);
    if (reasons.length === 0) {
      reasons.push("Matches baseline campaign filters");
    }

    return {
      influencer,
      score: Math.round(finalScore * 10) / 10, // 1 decimal place round
      reasons
    };
  });
};

export const scoreCampaigns = (campaigns, influencer, history = []) => {
  return campaigns.map((campaign) => {
    let reasons = [];
    const campaignIndustry = (campaign.industry || "").toLowerCase();
    const infCategory = (influencer.category || "").toLowerCase();
    
    // ==========================================
    // 1. Niche Match Score (30% Weight)
    // ==========================================
    let nicheScore = 40;
    if (campaignIndustry && campaignIndustry === infCategory) {
      nicheScore = 100;
      reasons.push(`Perfect match for your niche (${infCategory})`);
    } else if (campaignIndustry) {
      let foundSynonym = false;
      for (const [key, related] of Object.entries(NicheSynonyms)) {
        if (
          (key === campaignIndustry && related.includes(infCategory)) ||
          (related.includes(campaignIndustry) && related.includes(infCategory)) ||
          (key === infCategory && related.includes(campaignIndustry))
        ) {
          nicheScore = 80;
          reasons.push(`Industry closely related to your category`);
          foundSynonym = true;
          break;
        }
      }
      if (!foundSynonym) nicheScore = 60;
    }

    // ==========================================
    // 2. Platform Match (20% Weight)
    // ==========================================
    let platformScore = 30;
    const campaignPlatforms = (campaign.platform || []).map(p => (p || "").toLowerCase());
    const influencerPlatforms = (influencer.platforms || []).map(p => (p.name || "").toLowerCase());
    
    const matchedPlatforms = campaignPlatforms.filter(p => p && influencerPlatforms.includes(p));
    if (matchedPlatforms.length > 0) {
      platformScore = 100;
      reasons.push(`Matches your active platforms (${matchedPlatforms[0]})`);
    }

    // ==========================================
    // 3. Experience/History Match (25% Weight) - NEW
    // ==========================================
    let experienceScore = 0;
    const safeHistory = history || [];
    // Boost if worked with this specific brand before
    const workedWithBrand = safeHistory.some(h => h && h.brand && campaign.brand && String(h.brand) === String(campaign.brand?._id || campaign.brand));
    // Boost if worked in this industry before
    const workedInIndustry = safeHistory.some(h => h && h.campaign && (h.campaign.industry || "").toLowerCase() === campaignIndustry && campaignIndustry !== "");

    if (workedWithBrand) {
      experienceScore = 100;
      reasons.push("Previous successful collab with this brand");
    } else if (workedInIndustry) {
      experienceScore = 90;
      reasons.push(`Proven track record in ${campaignIndustry}`);
    } else if (safeHistory.length > 0) {
      experienceScore = 60;
      reasons.push("Experienced influencer with completed collabs");
    } else {
      experienceScore = 40;
    }

    // ==========================================
    // 4. Portfolio Relevance (15% Weight) - NEW
    // ==========================================
    let portfolioScore = 50;
    const portfolioItems = Array.isArray(influencer.portfolio) ? influencer.portfolio : [];
    const campaignName = (campaign.name || "").toLowerCase();
    const campaignDesc = (campaign.description || "").toLowerCase();

    const hasRelevantPortfolio = portfolioItems.some(item => {
      const title = (item.title || "").trim().toLowerCase();
      if (!title) return false;
      return (campaignIndustry && title.includes(campaignIndustry)) || (campaignName && campaignName.includes(title)) || (campaignDesc && campaignDesc.includes(title));
    });

    if (hasRelevantPortfolio) {
      portfolioScore = 100;
      reasons.push("Your portfolio shows matching work samples");
    } else if (portfolioItems.length > 0) {
      portfolioScore = 70;
      reasons.push("Matches your professional portfolio style");
    }

    // ==========================================
    // 5. Budget Fit (10% Weight)
    // ==========================================
    let budgetScore = 50;
    const campaignMinBudget = campaign.budget?.min || 0;
    const allServices = Array.isArray(influencer.platforms) ? influencer.platforms.flatMap(p => p.services || []) : [];
    const influencerMinPrice = allServices.reduce((min, s) => ((s && s.price !== undefined && s.price < min) ? s.price : min), Infinity);

    if (influencerMinPrice !== Infinity && campaignMinBudget > 0) {
      if (influencerMinPrice <= campaignMinBudget) {
        budgetScore = 100;
        reasons.push("Budget aligns with your rates");
      } else if (influencerMinPrice <= campaignMinBudget * 1.3) {
        budgetScore = 80;
      }
    }

    // Weighted Final Calculation
    const finalScore = (
      nicheScore * 0.30 +
      platformScore * 0.20 +
      experienceScore * 0.25 +
      portfolioScore * 0.15 +
      budgetScore * 0.10
    );

    reasons = [...new Set(reasons)].slice(0, 4);
    if (reasons.length === 0) reasons.push("General profile alignment");

    return {
      campaign,
      score: Math.round(finalScore * 10) / 10,
      reasons
    };
  });
};

export const scoreBrands = (brands, influencer, history = []) => {
  return brands.map((brand) => {
    let reasons = [];
    const brandIndustry = (brand.industry || "").toLowerCase();
    const infCategory = (influencer.category || "").toLowerCase();
    const safeHistory = Array.isArray(history) ? history : [];
    
    // ==========================================
    // 1. Industry Fit (40% Weight)
    // ==========================================
    let industryScore = 50;
    if (brandIndustry && brandIndustry === infCategory) {
      industryScore = 100;
      reasons.push(`Brand operates in your niche (${infCategory})`);
    } else if (brandIndustry) {
      for (const [key, related] of Object.entries(NicheSynonyms)) {
        if ((key === brandIndustry && related.includes(infCategory)) ||
            (key === infCategory && related.includes(brandIndustry))) {
          industryScore = 80;
          reasons.push("Brand industry aligns with your category");
          break;
        }
      }
    }

    // ==========================================
    // 2. Collaboration History (30% Weight)
    // ==========================================
    let historyScore = 40;
    const pastCollab = safeHistory.some(h => h && h.brand && brand.user && String(h.brand) === String(brand.user?._id || brand.user));
    if (pastCollab) {
      historyScore = 100;
      reasons.push("Successful past partnership with this brand");
    } else if (safeHistory.some(h => h && h.campaign && (h.campaign.industry || "").toLowerCase() === brandIndustry && brandIndustry !== "")) {
      historyScore = 70;
      reasons.push(`You have experience in ${brand.brandname || "this brand"}'s industry`);
    }

    // ==========================================
    // 3. Rating & Reputation (20% Weight)
    // ==========================================
    let reputationScore = (brand.rating || 0) * 20; // 5 stars = 100
    if (reputationScore > 80) {
      reasons.push("Highly rated brand by other influencers");
    }

    // ==========================================
    // 4. Portfolio Synergy (10% Weight)
    // ==========================================
    let portfolioScore = 50;
    const portfolioItems = Array.isArray(influencer.portfolio) ? influencer.portfolio : [];
    if (portfolioItems.length > 0) {
      const hasRelatedWork = portfolioItems.some(item => {
        const title = (item.title || "").trim().toLowerCase();
        if (!title) return false;
        const bName = (brand.brandname || "").trim().toLowerCase();
        return (brandIndustry && title.includes(brandIndustry)) || (bName && title.includes(bName));
      });
      if (hasRelatedWork) {
        portfolioScore = 100;
        reasons.push("Your portfolio matches brand's style");
      }
    }

    const finalScore = (
      industryScore * 0.4 +
      historyScore * 0.3 +
      reputationScore * 0.2 +
      portfolioScore * 0.1
    );

    reasons = [...new Set(reasons)].slice(0, 3);
    if (reasons.length === 0) reasons.push("General brand alignment");

    return {
      brand,
      score: Math.round(finalScore * 10) / 10,
      reasons
    };
  });
};
