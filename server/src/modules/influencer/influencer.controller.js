import { influencerService } from "./influencer.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";
import { checkAndMarkComplete, getCompletionStatus } from "../../utils/profileCompletion.js";

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
// const updateInfluencerProfile = AsyncHandler(async (req, res) => {
//     const updateData = { ...req.body };
//     if (req.files?.profilePicture?.[0]?.path) {
//         const upload = await uploadOnCloudinary(req.files.profilePicture[0].path);
//         if (upload) updateData.profilePicture = upload.url;
//     }

//     const influencer = await influencerService.updateProfile(req.user._id, updateData);
//     return res.status(validationStatus.ok).json(
//         new ApiResponse(validationStatus.ok, influencer, "Influencer profile updated successfully")
//     );
// });


/**
 * PATCH /influencers/update-profile
 * Saves bio, username, category, platforms, services, location, portfolio
 * Runs completion check after every save
 */
const updateInfluencerProfile = AsyncHandler(async (req, res) => {
    const updateData = { ...req.body };

    if (req.files?.profilePicture?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.profilePicture[0].path);
        if (upload?.url) updateData.profilePicture = upload.url;
    }

    if (req.files?.coverImage?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.coverImage[0].path);
        if (upload?.url) updateData.coverImage = upload.url;
    }

    if (req.files?.resume?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.resume[0].path);
        if (upload?.url) updateData.resume = upload.url;
    }

    if (typeof updateData.recentWork === "string") {
        try {
            updateData.recentWork = JSON.parse(updateData.recentWork);
        } catch (e) {
            delete updateData.recentWork;
        }
    }

    // Handle nested socialMedia object from FormData e.g. socialMedia[instagram]
    const socialMedia = {};
    const socialPlatforms = ["instagram", "tiktok", "twitter", "linkedin", "youtube"];
    let hasSocial = false;

    socialPlatforms.forEach(p => {
        const key = `socialMedia[${p}]`;
        if (updateData[key] !== undefined) {
            socialMedia[p] = updateData[key];
            delete updateData[key];
            hasSocial = true;
        }
    });

    if (hasSocial) {
        updateData.socialMedia = socialMedia;
    }

    const influencer = await influencerService.updateProfile(req.user._id, updateData);

    // Always re-evaluate after save
    await checkAndMarkComplete(req.user._id, "influencer");
    const completion = await getCompletionStatus(req.user._id, "influencer");

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { influencer, completion }, "Profile updated successfully")
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
