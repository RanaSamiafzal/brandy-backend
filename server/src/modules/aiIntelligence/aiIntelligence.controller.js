import { intelligenceService } from "./intelligence.service.js";
import { recommendationService } from "./recommendation.service.js";
import { memoryService } from "../aiMemory/memory.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

/**
 * GET /api/v1/admin/ai/intelligence
 * Platform-wide intelligence summary
 */
const getPlatformIntelligence = AsyncHandler(async (req, res) => {
    const data = await intelligenceService.getGlobalIntelligence();
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, data, "Platform intelligence fetched")
    );
});

/**
 * GET /api/v1/admin/ai/recommendations/:brandId
 * Recommendations for specific brand
 */
const getBrandRecommendations = AsyncHandler(async (req, res) => {
    const { brandId } = req.params;
    const data = await recommendationService.getRecommendations(brandId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, data, "Recommendations fetched")
    );
});


export const aiIntelligenceController = {
    getPlatformIntelligence,
    getBrandRecommendations
};
