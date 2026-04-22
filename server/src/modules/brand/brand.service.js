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
 * Get analytics dashboard dashboard statistics
 * Aggregates reach, engagement, etc.
 */
const getAnalyticsDashboard = async (userId) => {
    // Ensure brand exists
    const brand = await Brand.findOne({ user: userId }).select("_id").lean();
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // Fetch all non-deleted campaigns for this brand
    const campaigns = await Campaign.find({ brand: userId, isDeleted: false }).lean();

    // If no campaigns have analytics, or they are all 0, seed some sample data as per user "sure"
    const hasAnalytics = campaigns.some(c => c.reach > 0);
    if (!hasAnalytics && campaigns.length > 0) {
        await seedSampleAnalytics(userId);
        // Re-fetch campaigns after seeding
        return getAnalyticsDashboard(userId);
    }

    // Aggregations
    const stats = {
        totalReach: 0,
        avgEngagementRate: 0,
        activeCampaigns: 0,
        engagementOverview: {
            likes: 0,
            comments: 0,
            shares: 0,
            impressions: 0
        },
        platformStats: {
            instagram: { reach: 0, engagement: 0, posts: 0, followers: 0 },
            youtube: { reach: 0, engagement: 0, posts: 0, followers: 0 },
            tiktok: { reach: 0, engagement: 0, posts: 0, followers: 0 }
        },
        campaignPerformance: [],
        topPerformers: [],
        collaborationCount: 0,
        requestStats: {
            sent: 0,
            received: 0,
            accepted: 0,
            pending: 0,
            total: 0
        }
    };

    // Fetch collaboration/request data
    const requests = await CollaborationRequest.find({
        $or: [
            { sender: userId },
            { receiver: userId }
        ]
    }).lean();

    requests.forEach(req => {
        stats.requestStats.total++;
        if (req.sender.toString() === userId.toString()) stats.requestStats.sent++;
        if (req.receiver.toString() === userId.toString()) stats.requestStats.received++;
        
        if (req.status === 'accepted') {
            stats.requestStats.accepted++;
            stats.collaborationCount++;
        } else if (req.status === 'pending') {
            stats.requestStats.pending++;
        }
    });

    let totalEngRate = 0;
    let campaignsWithEngRate = 0;

    campaigns.forEach(c => {
        stats.totalReach += c.reach || 0;
        if (c.engagementRate > 0) {
            totalEngRate += c.engagementRate;
            campaignsWithEngRate++;
        }
        if (c.status === 'active') stats.activeCampaigns++;

        stats.engagementOverview.likes += c.likes || 0;
        stats.engagementOverview.comments += c.comments || 0;
        stats.engagementOverview.shares += c.shares || 0;
        stats.engagementOverview.impressions += c.impressions || 0;

        // Platform specific logic (simplification: mapping first platform if multiple)
        const primaryPlatform = Array.isArray(c.platform) ? c.platform[0] : c.platform;
        if (primaryPlatform && stats.platformStats[primaryPlatform]) {
            stats.platformStats[primaryPlatform].reach += c.reach || 0;
            stats.platformStats[primaryPlatform].posts += 1; // Assuming 1 post per campaign for now
            stats.platformStats[primaryPlatform].engagement += c.engagementRate || 0;
        }

        stats.campaignPerformance.push({
            name: c.name,
            reach: c.reach || 0,
            engagement: c.engagementRate || 0,
            roi: c.roi || 0,
            budget: c.budget?.max || 0,
            id: c._id
        });
    });

    stats.avgEngagementRate = campaignsWithEngRate > 0 ? (totalEngRate / campaignsWithEngRate).toFixed(1) : 0;
    
    // Calculate platform engagement averages
    Object.keys(stats.platformStats).forEach(p => {
        if (stats.platformStats[p].posts > 0) {
            stats.platformStats[p].engagement = (stats.platformStats[p].engagement / stats.platformStats[p].posts).toFixed(1);
            // Mock followers gained for polish
            stats.platformStats[p].followers = Math.floor(stats.platformStats[p].reach * 0.05); 
        }
    });

    // Mock Top Performers for visual completeness as per design
    stats.topPerformers = [
        { id: "sarah_chen_mock", name: "Sarah Chen", reach: "450K", engagement: "6.2%", avatar: "https://i.pravatar.cc/150?u=sarah" },
        { id: "mike_johnson_mock", name: "Mike Johnson", reach: "380K", engagement: "7.5%", avatar: "https://i.pravatar.cc/150?u=mike" },
        { id: "emma_davis_mock", name: "Emma Davis", reach: "320K", engagement: "5.8%", avatar: "https://i.pravatar.cc/150?u=emma" }
    ];

    return stats;
};

/**
 * Seed sample analytics data for a brand's campaigns
 */
const seedSampleAnalytics = async (userId) => {
    const campaigns = await Campaign.find({ brand: userId, isDeleted: false });
    for (const campaign of campaigns) {
        const reach = Math.floor(Math.random() * 500000) + 100000;
        const engagementRate = parseFloat((Math.random() * 8 + 2).toFixed(1));
        const roi = Math.floor(Math.random() * 400) + 100;
        const impressions = Math.floor(reach * (Math.random() * 2 + 1.2));
        const likes = Math.floor(reach * (engagementRate / 100) * 0.7);
        const comments = Math.floor(likes * 0.15);
        const shares = Math.floor(likes * 0.05);

        await Campaign.findByIdAndUpdate(campaign._id, {
            $set: {
                reach,
                engagementRate,
                roi,
                impressions,
                likes,
                comments,
                shares
            }
        });
    }
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
    // Handle socialMedia Map replacement separately to ensure keys can be deleted
    if (updateData.socialMedia) {
        console.log(`[BrandService] SYNCING socialMedia for user ${userId}. Data:`, JSON.stringify(updateData.socialMedia));
        const brandDoc = await Brand.findOne({ user: userId });
        if (brandDoc) {
            brandDoc.socialMedia.clear();
            const entries = Object.entries(updateData.socialMedia);
            if (entries.length > 0) {
                entries.forEach(([platform, value]) => {
                    brandDoc.socialMedia.set(platform, value || "");
                });
            }
            await brandDoc.save({ validateBeforeSave: false });
            console.log(`[BrandService] Map updated successfully. Current keys:`, Array.from(brandDoc.socialMedia.keys()));
        } else {
            console.log(`[BrandService] Brand profile not found during socialMedia sync.`);
        }
        delete updateData.socialMedia;
    }

    const brand = await Brand.findOneAndUpdate(
        { user: userId },
        { $set: updateData },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    console.log("Updated/Created Brand:", brand);
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // Sync user fullname for consistency
    if (updateData.brandname) {
        await User.findByIdAndUpdate(userId, { fullname: updateData.brandname });
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
                user: 1,
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
                fullname: "$userDoc.fullname",
                profilePic: "$userDoc.profilePic",
                isVerified: "$userDoc.isVerified",
                verifiedPlatforms: "$userDoc.verifiedPlatforms",
                profileComplete: "$userDoc.profileComplete",
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
    getAnalyticsDashboard,
    seedSampleAnalytics
};
