import { brandService } from "./brand.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";

/**
 * Get brand dashboard
 */
const getBrandDashboard = AsyncHandler(async (req, res) => {
    const stats = await brandService.getDashboardStats(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, stats, "Brand dashboard fetched successfully")
    );
});

/**
 * Get brand influencers
 */
const getBrandInfluencers = AsyncHandler(async (req, res) => {
    const influencers = await brandService.getBrandInfluencers(req.query);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, influencers, "Influencers fetched successfully")
    );
});

/**
 * Get brand activity
 */
const getBrandActivity = AsyncHandler(async (req, res) => {
    const activity = await brandService.getBrandActivity(req.user._id, req.query);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, activity, "Activity fetched successfully")
    );
});

/**
 * Get brand single influencer
 */
const getBrandInfluencer = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const influencer = await brandService.getBrandInfluencerById(id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, influencer, "Influencer fetched successfully")
    );
});

/**
 * Mark activity as read
 */
const markActivityAsRead = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const activity = await brandService.markBrandActivityAsRead(id, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, activity, "Activity marked as read")
    );
});

/**
 * Delete activity
 */
const deleteActivity = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    await brandService.deleteBrandActivity(id, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Activity deleted successfully")
    );
});

/**
 * Get brand profile
 */
const getBrandProfile = AsyncHandler(async (req, res) => {
    const profile = await brandService.getProfile(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, profile, "Brand profile fetched successfully")
    );
});

/**
 * Update brand profile
 */
const updateBrandProfile = AsyncHandler(async (req, res) => {
    const updateData = { ...req.body };
    if (req.files?.logo?.[0]?.path) {
        const logoUpload = await uploadOnCloudinary(req.files.logo[0].path);
        if (logoUpload) updateData.logo = logoUpload.url;
    }

    const brand = await brandService.updateProfile(req.user._id, updateData);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, brand, "Brand profile updated successfully")
    );
});

export const brandController = {
    getBrandDashboard,
    getBrandProfile,
    updateBrandProfile,
    getBrandInfluencers,
    getBrandActivity,
    getBrandInfluencer,
    markActivityAsRead,
    deleteActivity,
};

