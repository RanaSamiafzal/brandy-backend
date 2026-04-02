import Influencer from "./influencer.model.js";
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
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (!updatedInfluencer) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }
    return await getProfile(userId);
};

/**
 * Search influences with filtering
 */
// const searchInfluencers = async ({ search, category, platform, minPrice, maxPrice, minFollowers, rating, location, page = 1, limit = 10, sort = "latest" }) => {
//     const skip = (page - 1) * limit;

//     const matchStage = { isAvailable: true };
//     if (search) matchStage.username = { $regex: search, $options: "i" };
//     if (category) matchStage.category = category;
//     if (location) matchStage.location = { $regex: location, $options: "i" };
//     if (rating) matchStage.averageRating = { $gte: Number(rating) };

//     const pipeline = [
//         { $match: matchStage },
//         { $unwind: "$platforms" },
//         ...(platform ? [{ $match: { "platforms.name": platform } }] : []),
//         ...(minFollowers ? [{ $match: { "platforms.followers": { $gte: Number(minFollowers) } } }] : []),
//         { $unwind: "$platforms.services" },
//         ...(minPrice || maxPrice ? [{
//             $match: {
//                 "platforms.services.price": {
//                     ...(minPrice ? { $gte: Number(minPrice) } : {}),
//                     ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
//                 }
//             }
//         }] : []),
//         {
//             $group: {
//                 _id: "$_id",
//                 username: { $first: "$username" },
//                 profilePicture: { $first: "$profilePicture" },
//                 category: { $first: "$category" },
//                 averageRating: { $first: "$averageRating" },
//                 location: { $first: "$location" },
//                 platforms: { $push: "$platforms" },
//                 minPrice: { $min: "$platforms.services.price" },
//             }
//         },
//         sort === "rating_desc" ? { $sort: { averageRating: -1 } } : { $sort: { createdAt: -1 } },
//         {
//             $facet: {
//                 data: [{ $skip: skip }, { $limit: Number(limit) }],
//                 totalCount: [{ $count: "count" }],
//             }
//         },
//     ];

//     const result = await Influencer.aggregate(pipeline);
//     const influencers = result[0].data || [];
//     const totalCount = result[0].totalCount[0]?.count || 0;

//     return {
//         influencers,
//         total: totalCount,
//         page: Number(page),
//         pages: Math.ceil(totalCount / limit),
//     };
// };

/**
 * Search influencers — VISIBILITY GATED
 * Only returns influencers where User.profileComplete = true AND User.isBlocked = false
 */

const searchInfluencers = async ({
    search,
    category,
    platform,
    minPrice,
    maxPrice,
    minFollowers,
    rating,
    location,
    page = 1,
    limit = 10,
    sort = "latest",
}) => {
    const skip = (page - 1) * limit;

    // Initial match on Influencer fields
    const matchStage = { isAvailable: true };
    if (category) matchStage.category = category;
    if (location) matchStage.location = { $regex: location, $options: "i" };
    if (rating) matchStage.averageRating = { $gte: Number(rating) };
    if (search) matchStage.username = { $regex: search, $options: "i" };

    const pipeline = [
        { $match: matchStage },

        // ── JOIN User to check profileComplete ────────────────────────────────
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userDoc",
            },
        },
        { $unwind: "$userDoc" },

        // ── VISIBILITY GATE: only complete, non-blocked profiles ──────────────
        {
            $match: {
                // "userDoc.profileComplete": true,
                "userDoc.isBlocked": false,
            },
        },

        // Platform filter (done after join so we don't lose the user doc)
        ...(platform
            ? [{ $match: { "platforms.name": { $regex: platform, $options: "i" } } }]
            : []),

        // Unwind for follower + price filters
        { $unwind: "$platforms" },

        ...(minFollowers
            ? [{ $match: { "platforms.followers": { $gte: Number(minFollowers) } } }]
            : []),

        { $unwind: "$platforms.services" },

        ...((minPrice || maxPrice)
            ? [{
                $match: {
                    "platforms.services.price": {
                        ...(minPrice ? { $gte: Number(minPrice) } : {}),
                        ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                    },
                },
            }]
            : []),

        // Re-group to get one doc per influencer
        {
            $group: {
                _id: "$_id",
                user: { $first: "$userDoc._id" },
                userFullname: { $first: "$userDoc.fullname" },
                userProfilePic: { $first: "$userDoc.profilePic" },
                isVerified: { $first: "$userDoc.isVerified" },
                username: { $first: "$username" },
                about: { $first: "$about" },
                category: { $first: "$category" },
                averageRating: { $first: "$averageRating" },
                location: { $first: "$location" },
                platforms: { $push: "$platforms" },
                minPrice: { $min: "$platforms.services.price" },
            },
        },

        sort === "rating_desc"
            ? { $sort: { averageRating: -1 } }
            : { $sort: { _id: -1 } },

        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ];

    const result = await Influencer.aggregate(pipeline);
    const influencers = result[0]?.data || [];
    const totalCount = result[0]?.totalCount[0]?.count || 0;

    return {
        influencers,
        total: totalCount,
        page: Number(page),
        pages: Math.ceil(totalCount / limit),
    };
};



/**
 * Get single influencer by ID
 */
// const getInfluencerById = async (influencerId) => {
//     const influencers = await Influencer.aggregate([
//         { $match: { _id: new mongoose.Types.ObjectId(influencerId) } },
//         { $lookup: { from: "users", localField: "user", foreignField: "_id", as: "user" } },
//         { $unwind: "$user" },
//         { $limit: 1 }
//     ]);

//     if (!influencers.length) {
//         throw new ApiError(validationStatus.notFound, "Influencer not found");
//     }

//     const influencer = influencers[0];
//     const totalFollowers = influencer.platforms.reduce((acc, p) => acc + (p.followers || 0), 0);

//     return { influencer, totalFollowers };
// };

/**
 * Get single influencer by ID — VISIBILITY GATED
 * Returns 404 if profileComplete = false (invisible to public)
 */
const getInfluencerById = async (influencerId) => {
    const influencers = await Influencer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(influencerId) } },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "user",
            },
        },
        { $unwind: "$user" },
        { $limit: 1 },
        {
            $project: {
                "user.password": 0,
                "user.refreshToken": 0,
                "user.passwordResetOTP": 0,
            },
        },
    ]);

    if (!influencers.length) {
        throw new ApiError(validationStatus.notFound, "Influencer not found");
    }

    const influencer = influencers[0];

    // VISIBILITY GATE — profile must be complete to be publicly viewable
    // if (!influencer.user?.profileComplete) {
    //     throw new ApiError(
    //         validationStatus.notFound,
    //         "This influencer's profile is not available."
    //     );
    // }

    const totalFollowers = influencer.platforms.reduce(
        (acc, p) => acc + (p.followers || 0),
        0
    );

    return { influencer, totalFollowers };
};





export const influencerService = {
    getDashboardStats,
    getProfile,
    updateProfile,
    searchInfluencers,
    getInfluencerById,
};
