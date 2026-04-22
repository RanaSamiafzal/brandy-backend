import { brandService } from "./brand.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";
import { checkAndMarkComplete, getCompletionStatus } from "../../utils/profileCompletion.js";

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
 * Get brand analytics dashboard
 */
const getBrandAnalytics = AsyncHandler(async (req, res) => {
    const analytics = await brandService.getAnalyticsDashboard(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, analytics, "Brand analytics fetched successfully")
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
// const updateBrandProfile = AsyncHandler(async (req, res) => {
//     const updateData = { ...req.body };
//     if (req.files?.logo?.[0]?.path) {
//         const logoUpload = await uploadOnCloudinary(req.files.logo[0].path);
//         if (logoUpload) updateData.logo = logoUpload.url;
//     }

//     const brand = await brandService.updateProfile(req.user._id, updateData);
//     return res.status(validationStatus.ok).json(
//         new ApiResponse(validationStatus.ok, brand, "Brand profile updated successfully")
//     );
// });


/**
 * PATCH /brands/update-profile
 * Saves brandname, industry, budgetRange, description, website, address, logo
 * Runs completion check after every save
 */
const updateBrandProfile = AsyncHandler(async (req, res) => {
    const updateData = { ...req.body };

    if (updateData.lookingForClear) {
        updateData.lookingFor = [];
        delete updateData.lookingForClear;
    } else if (updateData.lookingFor && typeof updateData.lookingFor === "object") {
        updateData.lookingFor = Object.values(updateData.lookingFor).filter(Boolean);
    }

    if (req.files?.logo?.[0]?.path) {
        const logoUpload = await uploadOnCloudinary(req.files.logo[0].path);
        if (logoUpload?.url) updateData.logo = logoUpload.url;
    }

    // Handle socialMedia object (either from JSON or FormData)
    let socialMedia = updateData.socialMedia || {};
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

    const brand = await brandService.updateProfile(req.user._id, updateData);
    console.log(brand);

    await checkAndMarkComplete(req.user._id, "brand");
    const completion = await getCompletionStatus(req.user._id, "brand");

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { brand, completion, user: req.user }, "Brand profile updated successfully")
    );
});


/**
 * Get brand public profile
 */
// const getBrandPublicProfile = AsyncHandler(async (req, res) => {
//     const { brandId } = req.params;
//     const data = await brandService.getPublicProfile(brandId);
//     return res
//         .status(validationStatus.ok)
//         .json(new ApiResponse(validationStatus.ok, data, "Brand profile fetched successfully"));
// });

/**
 * GET /brands/:brandId/public
 * Any authenticated user can view a brand's public profile + active campaigns
 * Only works if brand.profileComplete = true
 */
const getBrandPublicProfile = AsyncHandler(async (req, res) => {
    const { brandId } = req.params;
    const data = await brandService.getPublicProfile(brandId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, data, "Brand profile fetched successfully")
    );
});

/**
 * Get brand public list
 */

// const getPublicBrandList = AsyncHandler(async (req, res) => {
//     const { search, industry, page = 1, limit = 12 } = req.query;
//     const skip = (Number(page) - 1) * Number(limit);

//     const query = {};
//     if (industry && industry !== "All") {
//         query.industry = { $regex: industry, $options: "i" };
//     }

//     const pipeline = [
//         { $match: query },
//         { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
//         { $unwind: "$user" },
//         ...(search ? [{
//             $match: {
//                 $or: [
//                     { brandname: { $regex: search, $options: "i" } },
//                     { "user.fullname": { $regex: search, $options: "i" } },
//                 ]
//             }
//         }] : []),
//         { $project: { "user.password": 0, "user.refreshToken": 0 } },
//         { $sort: { createdAt: -1 } },
//         {
//             $facet: {
//                 brands: [{ $skip: skip }, { $limit: Number(limit) }],
//                 totalCount: [{ $count: "count" }],
//             },
//         },
//     ];

//     const result = await Brand.aggregate(pipeline);
//     const brands = result[0]?.brands || [];
//     const total = result[0]?.totalCount[0]?.count || 0;

//     return res.status(validationStatus.ok).json(
//         new ApiResponse(validationStatus.ok, {
//             brands,
//             total,
//             page: Number(page),
//             pages: Math.ceil(total / Number(limit)),
//         }, "Brands fetched")
//     );
// });


/**
 * GET /brands/public-list
 * Used by influencer Explore page — Brands tab
 * Only returns brands with profileComplete = true
 */
const getPublicBrandList = AsyncHandler(async (req, res) => {
    const { search, industry, page = 1, limit = 12 } = req.query;
    const data = await brandService.getPublicBrandList({ search, industry, page, limit });
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, data, "Brands fetched successfully")
    );
});




export const brandController = {
    getBrandDashboard,
    getBrandProfile,
    updateBrandProfile,
    getBrandInfluencers,
    getBrandActivity,
    getBrandAnalytics,
    getBrandInfluencer,
    markActivityAsRead,
    deleteActivity,
    getBrandPublicProfile,
    getPublicBrandList,
};

