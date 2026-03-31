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

export const brandService = {
    getDashboardStats,
    getProfile,
    updateProfile,
    getBrandInfluencers,
    getBrandActivity,
    getBrandInfluencerById,
    markBrandActivityAsRead,
    deleteBrandActivity,
};
