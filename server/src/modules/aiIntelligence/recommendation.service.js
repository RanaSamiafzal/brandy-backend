import User from '../user/user.model.js';
import AiMemory from '../aiMemory/aiMemory.model.js';

class RecommendationService {
    /**
     * Get Recommended Influencers for a Brand
     * (Simulated logic using Trust Score and Risk Level)
     */
    async getRecommendations(brandId) {
        // 1. Fetch High Trust Influencers
        const highTrustMemories = await AiMemory.find({ 
            riskLevel: 'LOW', 
            trustScore: { $gte: 70 } 
        })
        .sort({ trustScore: -1 })
        .limit(5)
        .populate('userId', 'fullname email profilePic platforms');

        // 2. Format recommendations
        return highTrustMemories.map(m => ({
            influencerId: m.userId._id,
            fullname: m.userId.fullname,
            trustScore: m.trustScore,
            platforms: m.userId.platforms,
            matchReason: "High trust score and clean historical record."
        }));
    }
}

export const recommendationService = new RecommendationService();
