import { moderationService } from "./moderation.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

/**
 * GET /api/v1/moderation/history/:userId
 * Get moderation logs for a user
 */
const getUserHistory = AsyncHandler(async (req, res) => {
    const { userId } = req.params;
    const history = await moderationService.getHistory(userId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, history, "Moderation history retrieved")
    );
});

/**
 * POST /api/v1/moderation/adjust-trust
 * Manually adjust user trust score
 */
const adjustUserTrust = AsyncHandler(async (req, res) => {
    const { userId, type, reason, trustChange } = req.body;
    const result = await moderationService.adjustTrust(userId, type, reason, trustChange, req.user._id);
    
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "User trust adjusted and logged")
    );
});

export const moderationController = {
    getUserHistory,
    adjustUserTrust
};
