import Brand from "./brand.model.js";
import Campaign from "../campaign/campaign.model.js";
import CollaborationRequest from "../collaboration/collaboration-request.model.js";
import Activity from "../activity/activity.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import mongoose from "mongoose";
import { influencerService } from "../influencer/influencer.service.js";
import { activityService } from "../activity/activity.service.js";

/**
 * Get brand dashboard statistics
 */
const getDashboardStats = async (userId) => {
    const brand = await Brand.findOne({ user: userId }).select("_id").lean();
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }
    const brandId = brand._id;

    const campaignStats = await Campaign.aggregate([
        { $match: { brand: brandId } },
        {
            $group: {
                _id: null,
                totalCampaigns: { $sum: 1 },
                activeCampaigns: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
                completedCampaigns: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            },
        },
    ]);

    const collaborationStats = await CollaborationRequest.aggregate([
        { $match: { sender: userId } },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                acceptedRequests: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
                pendingRequests: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                totalInfluencersContacted: { $addToSet: "$receiver" },
            },
        },
        {
            $project: {
                totalRequests: 1,
                acceptedRequests: 1,
                pendingRequests: 1,
                totalInfluencersContacted: { $size: "$totalInfluencersContacted" },
            },
        },
    ]);

    const recentCampaigns = await Campaign.find({ brand: brandId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name status createdAt")
        .lean();

    const campaignData = campaignStats[0] || { totalCampaigns: 0, activeCampaigns: 0, completedCampaigns: 0 };
    const collaborationData = collaborationStats[0] || { totalRequests: 0, acceptedRequests: 0, pendingRequests: 0, totalInfluencersContacted: 0 };

    return {
        totalCampaigns: campaignData.totalCampaigns,
        activeCampaigns: campaignData.activeCampaigns,
        completedCampaigns: campaignData.completedCampaigns,
        totalRequests: collaborationData.totalRequests,
        acceptedRequests: collaborationData.acceptedRequests,
        pendingRequests: collaborationData.pendingRequests,
        totalInfluencersContacted: collaborationData.totalInfluencersContacted,
        recentCampaigns,
    };
};

/**
 * Get influencers for brand search
 */
const getBrandInfluencers = async (queryParams) => {
    return await influencerService.searchInfluencers(queryParams);
};

/**
 * Get brand activity
 */
const getBrandActivity = async (userId, queryParams) => {
    return await activityService.getActivities(userId, queryParams);
};

/**
 * Get single influencer by ID
 */
const getBrandInfluencerById = async (influencerId) => {
    return await influencerService.getInfluencerById(influencerId);
};

/**
 * Mark activity as read
 */
const markBrandActivityAsRead = async (activityId, userId) => {
    return await activityService.markAsRead(activityId, userId);
};

/**
 * Delete activity
 */
const deleteBrandActivity = async (activityId, userId) => {
    return await activityService.deleteActivity(activityId, userId);
};

/**
 * Get brand profile
 */
const getProfile = async (userId) => {
    const profiles = await Brand.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { "user.password": 0, "user.refreshToken": 0 } }
    ]);

    if (!profiles.length) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }
    return profiles[0];
};

/**
 * Update brand profile
 */
const updateProfile = async (userId, updateData) => {
    const brand = await Brand.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true }
    );
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }
    return await getProfile(userId);
};





/**
 * Public profile — single brand + their active campaigns
 * VISIBILITY GATED: 404 if profileComplete = false
 */
const getPublicProfile = async (brandId) => {
    const brand = await Brand.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(brandId) } },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        {
            $project: {
                "user.password": 0,
                "user.refreshToken": 0,
                "user.passwordResetOTP": 0,
            },
        },
    ]);

    if (!brand.length) throw new ApiError(validationStatus.notFound, "Brand not found");

    // VISIBILITY GATE
    if (!brand[0].user?.profileComplete) {
        throw new ApiError(validationStatus.notFound, "This brand profile is not available");
    }

    const campaigns = await Campaign.find({
        brand: brand[0].user._id,
        isDeleted: false,
        status: { $in: ["active", "pending"] },
    })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    return { brand: brand[0], campaigns };
};


/**
 * Public brand list for influencer explore — VISIBILITY GATED
 * Only returns brands with User.profileComplete = true
 */
const getPublicBrandList = async ({ search, industry, page = 1, limit = 12 }) => {
    const skip = (Number(page) - 1) * Number(limit);

    const pipeline = [
        // Join user to get profileComplete
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userDoc",
            },
        },
        { $unwind: "$userDoc" },

        // ── VISIBILITY GATE ───────────────────────────────────────────────────
        {
            $match: {
                "userDoc.profileComplete": true,
                "userDoc.isBlocked": false,
            },
        },

        // Industry filter
        ...(industry && industry !== "All"
            ? [{ $match: { industry: { $regex: industry, $options: "i" } } }]
            : []),

        // Search filter
        ...(search
            ? [{
                $match: {
                    $or: [
                        { brandname: { $regex: search, $options: "i" } },
                        { "userDoc.fullname": { $regex: search, $options: "i" } },
                        { industry: { $regex: search, $options: "i" } },
                    ],
                },
            }]
            : []),

        {
            $project: {
                brandname: 1,
                industry: 1,
                description: 1,
                logo: 1,
                website: 1,
                address: 1,
                budgetRange: 1,
                createdAt: 1,
                "userDoc.fullname": 1,
                "userDoc.profilePic": 1,
                "userDoc.isVerified": 1,
            },
        },

        { $sort: { createdAt: -1 } },

        {
            $facet: {
                brands: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ];

    const result = await Brand.aggregate(pipeline);
    const brands = result[0]?.brands || [];
    const total = result[0]?.totalCount[0]?.count || 0;

    return {
        brands,
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
    };
};


export const brandService = {
    getDashboardStats,
    getProfile,
    updateProfile,
    getBrandInfluencers,
    getBrandActivity,
    getBrandInfluencerById,
    markBrandActivityAsRead,
    deleteBrandActivity,
    getPublicProfile,
    getPublicBrandList,
};
