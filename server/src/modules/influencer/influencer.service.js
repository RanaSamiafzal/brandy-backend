import Influencer from "./influencer.model.js";
import User from "../user/user.model.js";
import CollaborationRequest from "../collaboration/collaboration-request.model.js";
import Collaboration from "../collaboration/collaboration.model.js";
import Review from "../collaboration/review.model.js";
import Activity from "../activity/activity.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

import mongoose from "mongoose";

/**
 * Get influencer dashboard statistics
 */
const getDashboardStats = async (userId, days = 30) => {
    // 1. Fetch Influencer Profile for ratings
    const influencer = await Influencer.findOne({ user: userId }).select("_id averageRating").lean();
    if (!influencer) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }

    const objectUserId = new mongoose.Types.ObjectId(userId.toString());
    const periodDays = parseInt(days) || 30;
    const now = new Date();
    const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevPeriodStart = new Date(now.getTime() - 2 * periodDays * 24 * 60 * 60 * 1000);

    // 2. Fetch Aggregated Request Stats (Including Sent and Received)
    const statsResult = await CollaborationRequest.aggregate([
        { 
            $match: { 
                $or: [{ sender: objectUserId }, { receiver: objectUserId }] 
            } 
        },
        {
            $lookup: {
                from: "campaigns",
                localField: "campaign",
                foreignField: "_id",
                as: "campaignInfo"
            }
        },
        { $unwind: "$campaignInfo" },
        { $match: { "campaignInfo.isDeleted": false } },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                pendingRequests: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
                acceptedRequests: { $sum: { $cond: [{ $eq: ["$status", "accepted"] }, 1, 0] } }
            }
        }
    ]);

    // 3. Performance: Completion Rate
    const totalCollaborations = await Collaboration.countDocuments({ influencer: objectUserId, isDeleted: false });
    const completedCount = await Collaboration.countDocuments({ influencer: objectUserId, status: "completed", isDeleted: false });
    const completionRate = totalCollaborations > 0 ? Math.round((completedCount / totalCollaborations) * 100) : 0;

    // 4. Performance: Average Response Time
    const requestsWithResponse = await CollaborationRequest.find({
        receiver: objectUserId,
        respondedAt: { $ne: null }
    }).select("createdAt respondedAt").lean();

    let averageResponseTime = "N/A";
    if (requestsWithResponse.length > 0) {
        const totalResponseTime = requestsWithResponse.reduce((acc, req) => {
            const start = new Date(req.createdAt);
            const end = new Date(req.respondedAt);
            return acc + (end - start);
        }, 0);
        const avgMs = totalResponseTime / requestsWithResponse.length;
        const avgDays = (avgMs / (1000 * 60 * 60 * 24)).toFixed(1);
        averageResponseTime = `${avgDays} days`;
    }

    // 5. ALL Requests (Sent + Received, Top 3) with brand details
    const rawAllRequests = await CollaborationRequest.find({
        $or: [{ sender: objectUserId }, { receiver: objectUserId }]
    })
    .sort({ createdAt: -1 })
    .populate("sender", "fullname profilePic")
    .populate("receiver", "fullname profilePic")
    .populate({
        path: "campaign",
        match: { isDeleted: false },
        select: "name industry"
    })
    .lean();

    const allRequests = rawAllRequests
        .filter(req => req.campaign)
        .slice(0, 3)
        .map(req => {
            const isSent = req.sender?._id?.toString() === userId.toString();
            return {
                ...req,
                type: isSent ? "sent" : "received",
                brandDetails: isSent ? req.receiver : req.sender
            };
        });

    // 6. Analytics & Growth Calculation
    const allCollaborations = await Collaboration.find({
        influencer: objectUserId,
        isDeleted: false
    })
    .populate("brand", "fullname profilePic")
    .populate("campaign", "name industry reach engagementRate likes comments shares impressions status")
    .lean();

    const calculateAnalyticsForRange = (collabs, start, end) => {
        let stats = {
            reach: 0,
            engagementSum: 0,
            engagementCount: 0,
            tasksCompleted: 0,
            tasksTotal: 0,
            count: 0,
            likes: 0,
            comments: 0,
            shares: 0,
            impressions: 0
        };

        collabs.forEach(collab => {
            const date = new Date(collab.createdAt);
            if (date >= start && date < end) {
                stats.count++;
                if (collab.campaign) {
                    stats.reach += collab.campaign.reach || 0;
                    if (collab.campaign.engagementRate > 0) {
                        stats.engagementSum += collab.campaign.engagementRate;
                        stats.engagementCount++;
                    }
                    stats.likes += collab.campaign.likes || 10;
                    stats.comments += collab.campaign.comments || 5;
                    stats.shares += collab.campaign.shares || 2;
                    stats.impressions += collab.campaign.impressions || 100;
                }
                const total = collab.deliverables?.length || 0;
                const approved = collab.deliverables?.filter(d => 
                    ["APPROVED", "SUBMITTED", "DELIVERED"].includes(d.status)
                ).length || 0;
                stats.tasksTotal += total;
                stats.tasksCompleted += approved;
            }
        });
        return stats;
    };

    const current = calculateAnalyticsForRange(allCollaborations, periodStart, now);
    const previous = calculateAnalyticsForRange(allCollaborations, prevPeriodStart, periodStart);

    const getGrowth = (curr, prev) => {
        if (prev <= 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 100);
    };

    const finalAnalytics = {
        totalReach: current.reach,
        engagementRate: current.engagementCount > 0 ? parseFloat((current.engagementSum / current.engagementCount).toFixed(1)) : 0,
        collaborationCount: current.count,
        tasksCompleted: {
            completed: current.tasksCompleted,
            total: current.tasksTotal
        },
        engagementOverview: {
            likes: current.likes,
            comments: current.comments,
            shares: current.shares,
            impressions: current.impressions
        },
        growth: {
            reach: getGrowth(current.reach, previous.reach),
            engagement: getGrowth(
                current.engagementCount > 0 ? current.engagementSum / current.engagementCount : 0, 
                previous.engagementCount > 0 ? previous.engagementSum / previous.engagementCount : 0
            ),
            tasks: getGrowth(current.tasksCompleted, previous.tasksCompleted),
            collaborations: getGrowth(current.count, previous.count)
        },
        topBrands: [],
        collaborationPerformance: []
    };

    // Populate topBrands and performance from current period collabs
    const topBrandsMap = {};
    const currentCollabs = allCollaborations.filter(c => new Date(c.createdAt) >= periodStart);

    currentCollabs.forEach(collab => {
        const brandId = collab.brand?._id?.toString();
        if (brandId) {
            if (!topBrandsMap[brandId]) {
                topBrandsMap[brandId] = {
                    id: brandId,
                    name: collab.brand.fullname,
                    avatar: collab.brand.profilePic,
                    earnings: 0,
                    rate: 0
                };
            }
            const earnings = collab.agreedBudget || 0;
            topBrandsMap[brandId].earnings += earnings;
            if (collab.campaign?.engagementRate) {
                topBrandsMap[brandId].rate = Math.max(topBrandsMap[brandId].rate, collab.campaign.engagementRate);
            }
        }

        finalAnalytics.collaborationPerformance.push({
            id: collab._id,
            brand: collab.brand?.fullname || "Unknown",
            reach: collab.campaign?.reach || 0,
            engagement: collab.campaign?.engagementRate || 0,
            earnings: collab.agreedBudget || 0,
            deliverablesCount: collab.deliverables?.length || 0
        });
    });

    finalAnalytics.topBrands = Object.values(topBrandsMap)
        .sort((a, b) => b.earnings - a.earnings)
        .slice(0, 5);

    const recentActivities = await Activity.find({ user: userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

    return {
        stats: {
            ...(statsResult[0] || { totalRequests: 0, pendingRequests: 0, acceptedRequests: 0 }),
            completedCollaborations: completedCount
        },
        performance: {
            averageRating: influencer.averageRating || 0,
            completionRate: `${completionRate}%`,
            averageResponseTime
        },
        analytics: finalAnalytics,
        allRequests,
        collaborations: allCollaborations.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt)), 
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

    const influencer = profiles[0];

    // Fetch reviews
    const reviews = await Review.find({ reviewee: userId, role: "brand" })
        .populate("reviewer", "fullname profilePic")
        .sort({ createdAt: -1 })
        .lean();

    // Fetch active collaborations
    const activeCollaborations = await CollaborationRequest.find({
        receiver: userId,
        status: "accepted"
    })
    .populate("sender", "fullname profilePic")
    .populate("campaign", "name description budgetRange budget")
    .sort({ createdAt: -1 })
    .lean();

    return { ...influencer, reviews, activeCollaborations, collaborationCount: activeCollaborations.length };
};

/**
 * Update influencer profile
 */
const updateProfile = async (userId, updateData) => {
    // Handle socialMedia Map replacement separately to ensure keys can be deleted
    // (findOneAndUpdate with $set often merges Map keys instead of replacing them)
    if (updateData.socialMedia) {
        console.log(`[InfluencerService] SYNCING socialMedia for user ${userId}. Data:`, JSON.stringify(updateData.socialMedia));
        const influencer = await Influencer.findOne({ user: userId });
        if (influencer) {
            influencer.socialMedia.clear();
            const entries = Object.entries(updateData.socialMedia);
            if (entries.length > 0) {
                entries.forEach(([platform, value]) => {
                    influencer.socialMedia.set(platform, value || "");
                });
            }
            await influencer.save({ validateBeforeSave: false });
            console.log(`[InfluencerService] Map updated. New keys: ${Array.from(influencer.socialMedia.keys()).join(', ') || 'NONE'}`);
        } else {
            console.log(`[InfluencerService] Profile not found, skipping Map sync.`);
        }
        delete updateData.socialMedia;
    }

    const updatedInfluencer = await Influencer.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    if (!updatedInfluencer) {
        throw new ApiError(validationStatus.notFound, "Influencer profile not found");
    }

    // Sync user fullname for consistency
    if (updateData.username) {
        await User.findByIdAndUpdate(userId, { fullname: updateData.username });
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

    const matchStage = { isAvailable: true };
    if (search) matchStage.username = { $regex: search, $options: "i" };
    if (category) matchStage.category = category;
    if (location) matchStage.location = { $regex: location, $options: "i" };
    if (rating) matchStage.averageRating = { $gte: Number(rating) };

    const pipeline = [
        { $match: matchStage },
        // Add lookup for User table to retrieve their actual profilePic
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userDetails"
            }
        },
        { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
        { 
            $match: { 
                "userDetails.isDeactivated": { $ne: true },
                "userDetails.isBlocked": { $ne: true } 
            } 
        },
        { $unwind: { path: "$platforms", preserveNullAndEmptyArrays: true } },
        ...(platform ? [{ $match: { "platforms.name": platform } }] : []),
        ...(minFollowers ? [{ $match: { "platforms.followers": { $gte: Number(minFollowers) } } }] : []),
        { $unwind: { path: "$platforms.services", preserveNullAndEmptyArrays: true } },
        ...(minPrice || maxPrice ? [{
            $match: {
                "platforms.services.price": {
                    ...(minPrice ? { $gte: Number(minPrice) } : {}),
                    ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
                }
            }
        }] : []),
        {
            $group: {
                _id: "$_id",
                username: { $first: "$username" },
                profilePicture: { $first: { $cond: [{ $ifNull: ["$profilePicture", false] }, "$profilePicture", "$userDetails.profilePic"] } },
                category: { $first: "$category" },
                averageRating: { $first: "$averageRating" },
                location: { $first: "$location" },
                platforms: { $push: "$platforms" },
                minPrice: { $min: "$platforms.services.price" },
                createdAt: { $first: "$createdAt" },
                socialMedia: { $first: "$socialMedia" },
                isVerified: { $first: "$userDetails.isVerified" },
                verifiedPlatforms: { $first: "$userDetails.verifiedPlatforms" },
            }
        },
        sort === "rating_desc" ? { $sort: { averageRating: -1 } } : { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            }
        },
    ];

    const result = await Influencer.aggregate(pipeline);
    const influencers = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
        influencers,
        total: totalCount,
        page: Number(page),
        pages: Math.ceil(totalCount / Number(limit)),
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
        { 
            $match: { 
                $or: [
                    { _id: new mongoose.Types.ObjectId(influencerId) },
                    { user: new mongoose.Types.ObjectId(influencerId) }
                ]
            } 
        },
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

    // Fetch reviews
    const reviews = await Review.find({ reviewee: influencer.user._id, role: "brand" })
        .populate("reviewer", "fullname profilePic")
        .sort({ createdAt: -1 })
        .lean();

    const totalFollowers = influencer.platforms.reduce(
        (acc, p) => acc + (p.followers || 0),
        0
    );

    // Fetch active collaborations
    const activeCollaborations = await CollaborationRequest.find({
        receiver: influencer.user._id,
        status: "accepted"
    })
    .populate("sender", "fullname profilePic")
    .populate("campaign", "name description budgetRange budget")
    .sort({ createdAt: -1 })
    .lean();

    return { influencer: { ...influencer, reviews, activeCollaborations }, totalFollowers };
};





export const influencerService = {
    getDashboardStats,
    getProfile,
    updateProfile,
    searchInfluencers,
    getInfluencerById,
};
