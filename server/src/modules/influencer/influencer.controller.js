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
    const { days } = req.query;
    const stats = await influencerService.getDashboardStats(req.user._id, days);
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
        if (upload?.secure_url) updateData.profilePicture = upload.secure_url;
    }

    if (req.files?.coverImage?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.coverImage[0].path);
        if (upload?.secure_url) updateData.coverImage = upload.secure_url;
    }

    if (req.files?.resume?.[0]?.path) {
        const upload = await uploadOnCloudinary(req.files.resume[0].path);
        if (upload?.secure_url) updateData.resume = upload.secure_url;
    }

    // Handle portfolio (links and files)
    let portfolio = [];
    let portfolioUpdated = false;

    if (updateData.portfolio !== undefined) {
        portfolioUpdated = true;
        if (typeof updateData.portfolio === "string") {
            try {
                portfolio = JSON.parse(updateData.portfolio);
                console.log(`[InfluencerController] Parsed portfolio from body: ${portfolio.length} items`);
            } catch (e) {
                console.error(`[InfluencerController] Failed to parse portfolio JSON:`, e.message);
                portfolio = [];
            }
        } else if (Array.isArray(updateData.portfolio)) {
            portfolio = updateData.portfolio;
            console.log(`[InfluencerController] Portfolio received as array: ${portfolio.length} items`);
        }
    }

    if (req.files?.portfolioFiles?.length > 0) {
        portfolioUpdated = true;
        console.log(`[InfluencerController] Processing ${req.files.portfolioFiles.length} new portfolio files...`);
        for (const file of req.files.portfolioFiles) {
            console.log(`[InfluencerController] Uploading to Cloudinary: ${file.originalname}`);
            // Use resource_type 'raw' for non-image files (PDFs, docs) to prevent
            // Cloudinary from returning a /image/upload/ URL that returns 401
            const isImage = /\.(jpe?g|png|gif|webp|svg|bmp)$/i.test(file.originalname);
            const upload = await uploadOnCloudinary(file.path, {
                resource_type: isImage ? 'image' : 'raw',
                use_filename: true,
                unique_filename: true
            });
            if (upload?.secure_url) {
                portfolio.push({
                    type: "file",
                    url: upload.secure_url,
                    title: file.originalname || "Portfolio Document",
                    fileSize: upload.bytes || 0,
                    format: upload.format || file.originalname?.split('.').pop() || ''
                });
            }
        }
    }

    if (portfolioUpdated) {
        updateData.portfolio = portfolio;
        console.log(`[InfluencerController] SAVING PORTFOLIO. Count: ${portfolio.length}`);
        portfolio.forEach((p, i) => console.log(`  [${i}] ${p.type}: ${p.title} (${p.url})`));
    } else {
        console.log(`[InfluencerController] Portfolio NOT updated in this request.`);
        delete updateData.portfolio;
    }

    if (typeof updateData.recentWork === "string") {
        try {
            updateData.recentWork = JSON.parse(updateData.recentWork);
        } catch (e) {
            delete updateData.recentWork;
        }
    }

    // Handle socialMedia object (either from JSON or FormData)
    let socialMedia = updateData.socialMedia;
    if (typeof socialMedia === 'string') {
        try {
            socialMedia = JSON.parse(socialMedia);
        } catch (e) {
            socialMedia = {};
        }
    } else {
        socialMedia = socialMedia || {};
    }
    const socialPlatforms = ["instagram", "tiktok", "twitter", "linkedin", "youtube", "facebook"];
    let hasSocialInRoot = false;

    // Support for FormData style: socialMedia[instagram]
    socialPlatforms.forEach(p => {
        const key = `socialMedia[${p}]`;
        if (updateData[key] !== undefined) {
            socialMedia[p] = updateData[key];
            delete updateData[key];
            hasSocialInRoot = true;
        }
    });

    if (hasSocialInRoot || updateData.socialMediaUpdate) {
        updateData.socialMedia = socialMedia;
        delete updateData.socialMediaUpdate;
    }

    const influencer = await influencerService.updateProfile(req.user._id, updateData);

    // Always re-evaluate after save
    await checkAndMarkComplete(req.user._id, "influencer");
    const completion = await getCompletionStatus(req.user._id, "influencer");

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { influencer, completion, user: req.user }, "Profile updated successfully")
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
