import { influencerService } from "./influencer.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";

/**
 * Get influencer dashboard
 */
const getInfluencerDashboard = AsyncHandler(async (req, res) => {
    const stats = await influencerService.getDashboardStats(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, stats, "Influencer dashboard fetched successfully")
    );
});

/**
 * Get influencer profile
 */
const getInfluencerProfile = AsyncHandler(async (req, res) => {
    const profile = await influencerService.getProfile(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, profile, "Influencer profile fetched successfully")
    );
});

/**
 * Update influencer profile
 */
const updateInfluencerProfile = AsyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    if (req.files?.profilePicture?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.profilePicture[0].path);
        if (upload) updateData.profilePicture = upload.url;
    }

    const influencer = await influencerService.updateProfile(req.user._id, updateData);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, influencer, "Influencer profile updated successfully")
    );
});

/**
 * Search influences
 */
const getAllInfluencer = AsyncHandler(async (req, res) => {
    const influencers = await influencerService.searchInfluencers(req.query);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, influencers, "Influencers fetched successfully")
    );
});

/**
 * Get single influencer details
 */
const getInfluencer = AsyncHandler(async (req, res) => {
    const { influencerId } = req.params;
    const details = await influencerService.getInfluencerById(influencerId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, details, "Influencer details fetched successfully")
    );
});

export const influencerController = {
    getInfluencerDashboard,
    getInfluencerProfile,
    updateInfluencerProfile,
    getAllInfluencer,
    getInfluencer,
};
