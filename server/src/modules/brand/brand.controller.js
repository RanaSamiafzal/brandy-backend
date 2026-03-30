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
};

