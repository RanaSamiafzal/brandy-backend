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

    const now = new Date();

    const campaignStats = await Campaign.aggregate([
        { 
            $match: { 
                brand: new mongoose.Types.ObjectId(userId), 
                isDeleted: false 
            } 
        },
        {
            $project: {
                status: 1,
                startDate: "$campaignTimeline.startDate",
                endDate: "$campaignTimeline.endDate",
                // Calculate dynamic status for the aggregation
                dynamicStatus: {
                    $cond: [
                        { $eq: ["$status", "draft"] }, "draft",
                        {
                            $cond: [
                                { $lt: [now, "$campaignTimeline.startDate"] }, "pending",
                                {
                                    $cond: [
                                        { $gt: [now, "$campaignTimeline.endDate"] }, "completed",
                                        "active"
                                    ]
                                }
                            ]
                        }
                    ]
                }
            }
        },
        {
            $group: {
                _id: null,
                totalCampaigns: { $sum: 1 },
                activeCampaigns: { $sum: { $cond: [{ $eq: ["$dynamicStatus", "active"] }, 1, 0] } },
                completedCampaigns: { $sum: { $cond: [{ $eq: ["$dynamicStatus", "completed"] }, 1, 0] } },
                pendingCampaigns: { $sum: { $cond: [{ $eq: ["$dynamicStatus", "pending"] }, 1, 0] } },
            },
        },
    ]);

    const collaborationStats = await CollaborationRequest.aggregate([
        { $match: { $or: [{ sender: new mongoose.Types.ObjectId(userId) }, { receiver: new mongoose.Types.ObjectId(userId) }] } },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                acceptedRequests: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } },
                pendingRequests: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                senders: { $addToSet: "$sender" },
                receivers: { $addToSet: "$receiver" },
            },
        },
        {
            $project: {
                totalRequests: 1,
                acceptedRequests: 1,
                pendingRequests: 1,
                totalInfluencersContacted: {
                    $size: {
                        $setDifference: [
                            { $setUnion: ["$senders", "$receivers"] },
                            [new mongoose.Types.ObjectId(userId)]
                        ]
                    }
                }
            },
        },
    ]);

    const recentCampaigns = await Campaign.find({ brand: userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name status createdAt")
        .lean();

    const campaignData = campaignStats[0] || { totalCampaigns: 0, activeCampaigns: 0, completedCampaigns: 0, pendingCampaigns: 0 };
    const collaborationData = collaborationStats[0] || { totalRequests: 0, acceptedRequests: 0, pendingRequests: 0, totalInfluencersContacted: 0 };

    return {
        totalCampaigns: campaignData.totalCampaigns,
        activeCampaigns: campaignData.activeCampaigns,
        completedCampaigns: campaignData.completedCampaigns,
        pendingCampaigns: campaignData.pendingCampaigns,
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
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    console.log("Updated/Created Brand:", brand);
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
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid brand identifier");
    }

    const brand = await Brand.aggregate([
        { 
            $match: { 
                $or: [
                    { _id: new mongoose.Types.ObjectId(brandId) },
                    { user: new mongoose.Types.ObjectId(brandId) }
                ]
            } 
        },
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

    // ── VISIBILITY GATE: Block if profile is not complete ──────────────────
    // if (!brand[0].user?.profileComplete) {
    //     throw new ApiError(validationStatus.notFound, "This brand profile is not available yet.");
    // }

    // Dynamic Counts for Profile
    const activeCampaignsCount = await Campaign.countDocuments({
        brand: brand[0].user._id,
        isDeleted: false,
        status: "active"
    });

    const totalCampaignsCount = await Campaign.countDocuments({
        brand: brand[0].user._id,
        isDeleted: false
    });

    const collaborationsCount = await CollaborationRequest.countDocuments({
        $or: [
            { sender: brand[0].user._id, status: "accepted" },
            { receiver: brand[0].user._id, status: "accepted" }
        ]
    });

    const campaigns = await Campaign.find({
        brand: brand[0].user._id,
        isDeleted: false,
        status: { $in: ["active", "pending"] },
    })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

    return { 
        brand: brand[0],
        campaigns,
        stats: {
            activeCampaignsCount,
            totalCampaignsCount,
            collaborationsCount
        }
    };
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

        // ── VISIBILITY GATE: Only show brands with profileComplete = true ──
        {
            $match: {
                // "userDoc.profileComplete": true,
                "userDoc.isBlocked": { $ne: true },
                "userDoc.isDeactivated": { $ne: true },
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
                followersCount: 1,
                rating: 1,
                reviewsCount: 1,
                socialMedia: 1,
                lookingFor: 1,
                createdAt: 1,
                "userDoc.fullname": 1,
                "userDoc.profilePic": 1,
                "userDoc.isVerified": 1,
                "userDoc.profileComplete": 1,
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
