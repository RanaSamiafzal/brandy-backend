import Influencer from "./influencer.model.js";
import User from "../user/user.model.js";
import CollaborationRequest from "../collaboration/collaboration-request.model.js";
import Activity from "../activity/activity.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import mongoose from "mongoose";

/**
 * Get influencer dashboard statistics
 */
const getDashboardStats = async (userId) => {
    const influencer = await Influencer.findOne({ user: userId }).select("_id").lean();
    if (!influencer) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }

    const stats = await CollaborationRequest.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(userId) } },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                pendingRequests: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                acceptedRequests: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } }
            }
        }
    ]);

    const recentActivities = await Activity.find({ user: userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

    return {
        stats: stats[0] || { totalRequests: 0, pendingRequests: 0, acceptedRequests: 0 },
        recentActivities,
        profile: influencer
    };
};

/**
 * Get influencer profile
 */
const getProfile = async (userId) => {
    const profiles = await Influencer.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(userId) } },
        { $limit: 1 },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $project: { "user.password": 0, "user.refreshToken": 0 } }
    ]);

    if (!profiles.length) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }
    return profiles[0];
};

/**
 * Update influencer profile
 */
const updateProfile = async (userId, updateData) => {
    const updatedInfluencer = await Influencer.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true }
    );
    if (!updatedInfluencer) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }
    return await getProfile(userId);
};

/**
 * Search influences with filtering
 */
const searchInfluencers = async ({ search, category, platform, minPrice, maxPrice, minFollowers, rating, location, page = 1, limit = 10, sort = "latest" }) => {
    const skip = (page - 1) * limit;

    // DIAGNOSTIC COUNTS
    const totalUsersInSystem = await User.countDocuments({});
    const influencersStrictMatch = await User.countDocuments({ role: "influencer" });
    const influencersRegexMatch = await User.countDocuments({ role: { $regex: /^influencer$/i } });

    // Use case-insensitive role matching just in case
    const findQuery = {
        role: { $regex: /^influencer$/i }
    };

    if (search) {
        findQuery.fullname = { $regex: search, $options: "i" };
    }

    const users = await User.find(findQuery)
        .skip(skip)
        .limit(Number(limit))
        .sort({ createdAt: -1 })
        .lean();

    const total = await User.countDocuments(findQuery);

    const influencers = await Promise.all(users.map(async (u) => {
        const profile = await Influencer.findOne({ user: u._id }).lean();
        return {
            _id: u._id,
            fullName: u.fullname,
            username: profile?.username || u.fullname,
            profilePicture: u.profilePic || profile?.profilePicture || "",
            category: profile?.category || "Lifestyle",
            averageRating: profile?.averageRating || 0,
            location: profile?.location || "Worldwide",
            platforms: profile?.platforms || [],
            minPrice: 0,
            createdAt: u.createdAt
        };
    }));

    return {
        influencers,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
        _debug: {
            totalUsersInSystem,
            influencersStrictMatch,
            influencersRegexMatch,
            queryUsed: findQuery
        }
    };
};

/**
 * Get single influencer by ID
 */
const getInfluencerById = async (influencerId) => {
    const influencers = await Influencer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(influencerId) } },
        { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
        { $unwind: "$user" },
        { $limit: 1 }
    ]);

    if (!influencers.length) {
        throw new ApiError(validationStatus.notFound, "Influencer not found");
    }

    const influencer = influencers[0];
    const totalFollowers = influencer.platforms.reduce((acc, p) => acc + (p.followers || 0), 0);

    return { influencer, totalFollowers };
};

export const influencerService = {
    getDashboardStats,
    getProfile,
    updateProfile,
    searchInfluencers,
    getInfluencerById,
};
