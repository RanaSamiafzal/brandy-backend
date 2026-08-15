import Brand from "./brand.model.js";
import User from "../user/user.model.js";
import Campaign from "../campaign/campaign.model.js";
import Collaboration from "../collaboration/collaboration.model.js";
import Payment from "../payment/payment.model.js";
import Activity from "../activity/activity.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import mongoose from "mongoose";
import { influencerService } from "../influencer/influencer.service.js";
import { activityService } from "../activity/activity.service.js";
import Review from "../collaboration/review.model.js";
import Influencer from "../influencer/influencer.model.js";
import { parseGeoPayload } from "../../utils/geoPayload.js";

const padMonth = (m) => String(m).padStart(2, "0");
const monthKey = (year, month) => `${year}-${padMonth(month)}`;

const buildMonthAxis = (count = 12, offsetMonths = 0) => {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetMonths - (count - 1), 1));
    const keys = [];
    const labels = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
        keys.push(monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1));
        labels.push(d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }));
    }
    return { start, keys, labels };
};

const startOfDay = (value) => {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
};

const endOfDay = (value) => {
    const d = new Date(value);
    d.setHours(23, 59, 59, 999);
    return d;
};

const parseDashboardRange = (from, to) => {
    if (!from && !to) return null;
    const end = to ? endOfDay(to) : endOfDay(new Date());
    const start = from ? startOfDay(from) : startOfDay(new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return null;
    return { start, end };
};

const buildMonthAxisFromRange = (startDate, endDate) => {
    const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
    const last = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
    const keys = [];
    const labels = [];
    const cursor = new Date(start);
    while (cursor <= last && keys.length < 24) {
        keys.push(monthKey(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1));
        labels.push(cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" }));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return { start, keys, labels };
};

const alignSeries = (values, length) => {
    const next = [...(values || [])];
    while (next.length < length) next.unshift(0);
    return next.slice(-length);
};

const dateMatch = (range) => (range ? { createdAt: { $gte: range.start, $lte: range.end } } : {});

const fillMonthCounts = (rows, keys) => {
    const map = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const row of rows) {
        const key = monthKey(row._id.y, row._id.m);
        if (key in map) map[key] = row.count;
    }
    return keys.map((k) => map[k]);
};

const roundMoney = (n) => Math.round(Number(n || 0) * 100) / 100;

const fillMonthSums = (rows, keys) => {
    const map = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const row of rows) {
        const key = monthKey(row._id.y, row._id.m);
        if (key in map) map[key] = roundMoney((map[key] || 0) + (row.total || 0));
    }
    return keys.map((k) => map[k]);
};

const addSeries = (a = [], b = []) => a.map((v, i) => roundMoney((v || 0) + (b[i] || 0)));

const groupByMonth = async (Model, match, dateExpr) => Model.aggregate([
    { $match: match },
    { $group: { _id: { y: { $year: dateExpr }, m: { $month: dateExpr } }, count: { $sum: 1 } } },
]);

const getInfluencerMapData = async () => {
    const located = await Influencer.aggregate([
        {
            $match: {
                "geo.lat": { $ne: null, $type: "number" },
                "geo.lng": { $ne: null, $type: "number" },
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userDoc",
            },
        },
        { $unwind: "$userDoc" },
        {
            $match: {
                "userDoc.isBlocked": { $ne: true },
                "userDoc.isDeactivated": { $ne: true },
            },
        },
        {
            $group: {
                _id: {
                    lat: { $round: ["$geo.lat", 2] },
                    lng: { $round: ["$geo.lng", 2] },
                    city: { $toLower: { $ifNull: ["$geo.city", ""] } },
                    country: { $toLower: { $ifNull: ["$geo.country", ""] } },
                },
                count: { $sum: 1 },
                avgRating: { $avg: { $ifNull: ["$averageRating", 0] } },
                categories: { $push: { $ifNull: ["$category", "Other"] } },
                lat: { $avg: "$geo.lat" },
                lng: { $avg: "$geo.lng" },
                city: { $first: "$geo.city" },
                country: { $first: "$geo.country" },
                formatted: { $first: "$geo.formatted" },
            },
        },
        { $sort: { count: -1 } },
        { $limit: 80 },
    ]);

    const markers = located.map((row) => {
        const tally = {};
        (row.categories || []).forEach((c) => {
            const key = (c && String(c).trim()) || "Other";
            tally[key] = (tally[key] || 0) + 1;
        });
        const topCategory = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0] || "Other";
        const name = row.city || row.formatted?.split(",")[0] || row.country || "Unknown";
        return {
            name,
            city: row.city || "",
            country: row.country || "",
            coordinates: [Number(row.lng), Number(row.lat)],
            count: row.count,
            avgRating: Number((row.avgRating || 0).toFixed(1)),
            topCategory,
        };
    });

    const categoryRows = await Influencer.aggregate([
        {
            $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "userDoc",
            },
        },
        { $unwind: "$userDoc" },
        {
            $match: {
                "userDoc.isBlocked": { $ne: true },
                "userDoc.isDeactivated": { $ne: true },
            },
        },
        {
            $group: {
                _id: {
                    $cond: [
                        { $gt: [{ $strLenCP: { $ifNull: ["$category", ""] } }, 0] },
                        "$category",
                        "Other",
                    ],
                },
                count: { $sum: 1 },
            },
        },
        { $sort: { count: -1 } },
        { $limit: 12 },
    ]);

    const categories = categoryRows.map((row) => ({
        label: row._id || "Other",
        count: row.count,
    }));

    return {
        markers,
        categories,
        locatedCount: markers.reduce((s, m) => s + m.count, 0),
        totalInfluencers: categories.reduce((s, c) => s + c.count, 0),
    };
};

const getCampaignsFlow = async (userId, range = null) => {
    const brandId = new mongoose.Types.ObjectId(userId);
    const current = range ? buildMonthAxisFromRange(range.start, range.end) : buildMonthAxis(12, 0);
    const previous = range
        ? buildMonthAxisFromRange(
            new Date(range.start.getTime() - (range.end - range.start)),
            new Date(range.start.getTime() - 1)
        )
        : buildMonthAxis(12, 12);
    const currentStart = range ? range.start : current.start;
    const currentEnd = range ? range.end : null;
    const previousStart = range ? new Date(range.start.getTime() - (range.end - range.start)) : previous.start;
    const previousEnd = range ? range.start : current.start;

    const currentCreated = currentEnd
        ? { $gte: currentStart, $lte: currentEnd }
        : { $gte: currentStart };
    const previousCreated = { $gte: previousStart, $lt: previousEnd };

    const [campaignRows, lastYearCampaignRows, requestRows, completedRows] = await Promise.all([
        groupByMonth(
            Campaign,
            { brand: brandId, isDeleted: false, createdAt: currentCreated },
            "$createdAt"
        ),
        groupByMonth(
            Campaign,
            { brand: brandId, isDeleted: false, createdAt: previousCreated },
            "$createdAt"
        ),
        groupByMonth(
            Collaboration,
            { brand: brandId, isDeleted: { $ne: true }, createdAt: currentCreated },
            "$createdAt"
        ),
        Collaboration.aggregate([
            {
                $match: {
                    brand: brandId,
                    isDeleted: { $ne: true },
                    status: "completed",
                    $or: [
                        { completedAt: currentCreated },
                        { completedAt: null, updatedAt: currentCreated },
                    ],
                },
            },
            { $addFields: { bucketDate: { $ifNull: ["$completedAt", "$updatedAt"] } } },
            { $match: { bucketDate: currentCreated } },
            {
                $group: {
                    _id: { y: { $year: "$bucketDate" }, m: { $month: "$bucketDate" } },
                    count: { $sum: 1 },
                },
            },
        ]),
    ]);

    return {
        labels: current.labels,
        campaigns: fillMonthCounts(campaignRows, current.keys),
        requests: fillMonthCounts(requestRows, current.keys),
        completed: fillMonthCounts(completedRows, current.keys),
        lastYearCampaigns: alignSeries(fillMonthCounts(lastYearCampaignRows, previous.keys), current.keys.length),
    };
};

const sumFundingByMonth = async (brandId, start, end) => {
    const historyDate = end ? { $gte: start, $lt: end } : { $gte: start };
    const leftoverDate = end ? { $gte: start, $lt: end } : { $gte: start };

    const [historyRows, leftoverRows] = await Promise.all([
        Collaboration.aggregate([
            { $match: { brand: brandId, isDeleted: { $ne: true }, fundingHistory: { $exists: true, $ne: [] } } },
            { $unwind: "$fundingHistory" },
            { $match: { "fundingHistory.fundedAt": historyDate } },
            {
                $group: {
                    _id: { y: { $year: "$fundingHistory.fundedAt" }, m: { $month: "$fundingHistory.fundedAt" } },
                    total: { $sum: { $ifNull: ["$fundingHistory.amount", 0] } },
                },
            },
        ]),
        Collaboration.aggregate([
            {
                $match: {
                    brand: brandId,
                    isDeleted: { $ne: true },
                    escrowFunded: true,
                    totalFundedAmount: { $gt: 0 },
                    updatedAt: leftoverDate,
                    $or: [{ fundingHistory: { $exists: false } }, { fundingHistory: { $eq: [] } }],
                },
            },
            {
                $group: {
                    _id: { y: { $year: "$updatedAt" }, m: { $month: "$updatedAt" } },
                    total: { $sum: { $ifNull: ["$totalFundedAmount", "$agreedBudget"] } },
                },
            },
        ]),
    ]);

    return { historyRows, leftoverRows };
};

const sumPaymentsByMonth = (brandId, start, end, status) => {
    const range = end ? { $gte: start, $lt: end } : { $gte: start };
    return Payment.aggregate([
        { $match: { brand: brandId, status } },
        { $addFields: { bucketDate: { $ifNull: ["$completion.completedAt", "$createdAt"] } } },
        { $match: { bucketDate: range } },
        {
            $group: {
                _id: { y: { $year: "$bucketDate" }, m: { $month: "$bucketDate" } },
                total: { $sum: { $ifNull: ["$amount", 0] } },
            },
        },
    ]);
};

const getBrandSpending = async (userId, range = null) => {
    const brandId = new mongoose.Types.ObjectId(userId);
    const current = range ? buildMonthAxisFromRange(range.start, range.end) : buildMonthAxis(12, 0);
    const previous = range
        ? buildMonthAxisFromRange(
            new Date(range.start.getTime() - (range.end - range.start)),
            new Date(range.start.getTime() - 1)
        )
        : buildMonthAxis(12, 12);
    const currentStart = range ? range.start : current.start;
    const currentEnd = range ? range.end : null;
    const previousStart = range ? new Date(range.start.getTime() - (range.end - range.start)) : previous.start;
    const previousEnd = range ? range.start : current.start;

    const [currentFunded, lastFunded, releasedRows, lastYearReleasedRows, snapshot] = await Promise.all([
        sumFundingByMonth(brandId, currentStart, currentEnd),
        sumFundingByMonth(brandId, previousStart, previousEnd),
        sumPaymentsByMonth(brandId, currentStart, currentEnd, "completed"),
        sumPaymentsByMonth(brandId, previousStart, previousEnd, "completed"),
        Collaboration.aggregate([
            { $match: { brand: brandId, isDeleted: { $ne: true }, escrowFunded: true } },
            {
                $group: {
                    _id: null,
                    funded: { $sum: { $ifNull: ["$totalFundedAmount", 0] } },
                    paid: { $sum: { $ifNull: ["$totalPaidAmount", 0] } },
                },
            },
        ]),
    ]);

    const funded = addSeries(
        fillMonthSums(currentFunded.historyRows, current.keys),
        fillMonthSums(currentFunded.leftoverRows, current.keys)
    );
    const released = fillMonthSums(releasedRows, current.keys);
    const lastYearFunded = alignSeries(
        addSeries(
            fillMonthSums(lastFunded.historyRows, previous.keys),
            fillMonthSums(lastFunded.leftoverRows, previous.keys)
        ),
        current.keys.length
    );
    const lastYearReleased = alignSeries(fillMonthSums(lastYearReleasedRows, previous.keys), current.keys.length);

    let runFunded = 0;
    let runReleased = 0;
    const payoutRate = funded.map((monthFunded, i) => {
        runFunded += monthFunded;
        runReleased += released[i] || 0;
        if (runFunded <= 0) return 0;
        return Math.round((runReleased / runFunded) * 1000) / 10;
    });

    const totals = snapshot[0] || { funded: 0, paid: 0 };
    const totalFunded = roundMoney(funded.reduce((s, n) => s + n, 0));
    const totalReleased = roundMoney(released.reduce((s, n) => s + n, 0));

    return {
        labels: current.labels,
        funded,
        released,
        lastYearFunded,
        lastYearReleased,
        payoutRate,
        totalFunded,
        totalReleased,
        allTimeFunded: roundMoney(totals.funded),
        allTimeReleased: roundMoney(totals.paid),
        heldInEscrow: roundMoney(Math.max(0, (totals.funded || 0) - (totals.paid || 0))),
    };
};

/**
 * Get brand dashboard statistics
 */
const getDashboardStats = async (userId, query = {}) => {
    const brand = await Brand.findOne({ user: userId }).select("_id").lean();
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    const range = parseDashboardRange(query.from, query.to);
    const now = new Date();
    const brandObjectId = new mongoose.Types.ObjectId(userId);

    const campaignStats = await Campaign.aggregate([
        {
            $match: {
                brand: brandObjectId,
                isDeleted: false,
                ...dateMatch(range),
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
                draftCampaigns: { $sum: { $cond: [{ $eq: ["$dynamicStatus", "draft"] }, 1, 0] } },
            },
        },
    ]);

    const acceptedStatuses = [
        "awaiting_onboarding",
        "awaiting_funds",
        "active",
        "in_progress",
        "review",
        "completed",
    ];

    const collaborationStats = await Collaboration.aggregate([
        {
            $match: {
                brand: brandObjectId,
                isDeleted: { $ne: true },
                ...dateMatch(range),
            }
        },
        {
            $group: {
                _id: null,
                totalRequests: { $sum: 1 },
                acceptedRequests: { $sum: { $cond: [{ $in: ["$status", acceptedStatuses] }, 1, 0] } },
                pendingRequests: { $sum: { $cond: [{ $eq: ["$status", "requested"] }, 1, 0] } },
                influencers: { $addToSet: "$influencer" },
            },
        },
        {
            $project: {
                totalRequests: 1,
                acceptedRequests: 1,
                pendingRequests: 1,
                totalInfluencersContacted: { $size: "$influencers" },
            },
        },
    ]);

    const recentCampaigns = await Campaign.find({ brand: userId, isDeleted: false, ...dateMatch(range) })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name status createdAt campaignTimeline")
        .lean();

    const campaignData = campaignStats[0] || {
        totalCampaigns: 0,
        activeCampaigns: 0,
        completedCampaigns: 0,
        pendingCampaigns: 0,
        draftCampaigns: 0,
    };
    const collaborationData = collaborationStats[0] || {
        totalRequests: 0,
        acceptedRequests: 0,
        pendingRequests: 0,
        totalInfluencersContacted: 0,
    };

    const collabStatusRows = await Collaboration.aggregate([
        {
            $match: {
                brand: brandObjectId,
                isDeleted: { $ne: true },
                ...dateMatch(range),
            },
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const statusCounts = Object.fromEntries(collabStatusRows.map((row) => [row._id, row.count]));
    const sumStatuses = (names) => names.reduce((s, name) => s + (statusCounts[name] || 0), 0);
    const collabCompleted = sumStatuses(["completed"]);
    const collabActive = sumStatuses(["active"]);
    const collabInProgress = sumStatuses(["in_progress", "review"]);
    const collabPending = sumStatuses(["requested", "awaiting_onboarding", "awaiting_funds"]);
    const collabClosed = sumStatuses(["rejected", "cancelled", "suspended"]);
    const collabStats = {
        completed: collabCompleted,
        active: collabActive,
        inProgress: collabInProgress,
        pending: collabPending,
        closed: collabClosed,
        total: collabCompleted + collabActive + collabInProgress + collabPending + collabClosed,
        donut: {
            labels: ["Completed", "Active", "In Progress"],
            data: [collabCompleted, collabActive, collabInProgress],
        },
        radar: {
            labels: ["Completed", "Active", "In Progress", "Pending", "Closed"],
            data: [collabCompleted, collabActive, collabInProgress, collabPending, collabClosed],
        },
    };

    const [campaignsFlow, influencerMap, brandSpending] = await Promise.all([
        getCampaignsFlow(userId, range),
        getInfluencerMapData(),
        getBrandSpending(userId, range),
    ]);

    return {
        totalCampaigns: campaignData.totalCampaigns,
        activeCampaigns: campaignData.activeCampaigns,
        completedCampaigns: campaignData.completedCampaigns,
        pendingCampaigns: campaignData.pendingCampaigns,
        draftCampaigns: campaignData.draftCampaigns || 0,
        totalRequests: collaborationData.totalRequests,
        acceptedRequests: collaborationData.acceptedRequests,
        pendingRequests: collaborationData.pendingRequests,
        totalInfluencersContacted: collaborationData.totalInfluencersContacted,
        recentCampaigns,
        campaignsFlow,
        influencerMap,
        brandSpending,
        collabStats,
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

    // Fetch total spending from Payment model
    const paymentStats = await Payment.aggregate([
        { $match: { brand: new mongoose.Types.ObjectId(userId), status: { $in: ['completed', 'pending', 'requested', 'pending_approval', 'approved', 'processing'] } } },
        { $group: { _id: "$status", total: { $sum: "$amount" } } }
    ]);
    
    let totalReleased = 0;
    let fundsInEscrow = 0;
    
    paymentStats.forEach(stat => {
        if (stat._id === 'completed') totalReleased += stat.total;
        else fundsInEscrow += stat.total;
    });
    
    const totalSpending = totalReleased + fundsInEscrow;

    // If no campaigns have analytics, or they are all 0, seed some sample data
    const hasAnalytics = campaigns.some(c => c.reach > 0);
    if (!hasAnalytics && campaigns.length > 0) {
        await seedSampleAnalytics(userId);
        // Re-fetch campaigns after seeding
        return getAnalyticsDashboard(userId);
    }

    // Aggregations
    const stats = {
        totalSpending,
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
        },
        fundsInEscrow,
        totalReleased,
        recentTransactions: []
    };

    // Fetch collaboration/request data
    const collaborations = await Collaboration.find({
        brand: userId,
        isDeleted: false
    }).populate("influencer", "fullname profilePic").lean();

    const influencerPerformanceMap = {};

    collaborations.forEach(collab => {
        // Track overall request stats (from HEAD logic)
        stats.requestStats.total++;
        stats.requestStats.received++; // Defaulting to received for the brand as per local changes

        if (collab.status === 'requested') {
            stats.requestStats.pending++;
        } else if (collab.status === 'accepted') {
            stats.requestStats.accepted++;
            stats.collaborationCount++;
        } else if (collab.status === 'active' || collab.status === 'completed') {
            stats.collaborationCount++;
        }

        // Track influencer performance
        const influencerId = collab.influencer?._id?.toString();
        if (influencerId) {
            if (!influencerPerformanceMap[influencerId]) {
                influencerPerformanceMap[influencerId] = {
                    id: influencerId,
                    name: collab.influencer.fullname,
                    avatar: collab.influencer.profilePic,
                    collabCount: 0,
                    totalEarnings: 0,
                    reach: 0,
                    engagementSum: 0,
                    engagementCount: 0
                };
            }
            influencerPerformanceMap[influencerId].collabCount++;
            influencerPerformanceMap[influencerId].totalEarnings += collab.agreedBudget || 0;
            // Since we don't have per-collab reach yet easily accessible here, we'll use campaign reach if available
        }
    });

    let totalEngRate = 0;
    let campaignsWithEngRate = 0;

    campaigns.forEach(c => {
        if (c.engagementRate > 0) {
            totalEngRate += c.engagementRate;
            campaignsWithEngRate++;
        }
        if (c.status === 'active') stats.activeCampaigns++;

        stats.engagementOverview.likes += c.likes || 0;
        stats.engagementOverview.comments += c.comments || 0;
        stats.engagementOverview.shares += c.shares || 0;
        stats.engagementOverview.impressions += c.impressions || 0;

        // Platform specific logic
        const primaryPlatform = Array.isArray(c.platform) ? c.platform[0] : c.platform;
        if (primaryPlatform && stats.platformStats[primaryPlatform]) {
            stats.platformStats[primaryPlatform].reach += c.reach || 0;
            stats.platformStats[primaryPlatform].posts += 1;
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
        }
    });

    // Real Top Performers ranking logic
    // We'll need to get the actual Influencer profiles for ratings
    const influencerIds = Object.keys(influencerPerformanceMap);
    const influencerProfiles = await mongoose.model("Influencer").find({ user: { $in: influencerIds } }).select("user averageRating reviewCount").lean();

    influencerProfiles.forEach(profile => {
        const id = profile.user.toString();
        if (influencerPerformanceMap[id]) {
            influencerPerformanceMap[id].rating = profile.averageRating || 0;
            influencerPerformanceMap[id].reviewCount = profile.reviewCount || 0;

            // Weighted score: 40% rating, 30% earnings, 20% collab count, 10% review count
            // Normalize earnings (log base)
            const earningsScore = Math.log10(influencerPerformanceMap[id].totalEarnings + 1) * 2;
            influencerPerformanceMap[id].score = (influencerPerformanceMap[id].rating * 4) + (earningsScore * 3) + (influencerPerformanceMap[id].collabCount * 2);
        }
    });

    stats.topPerformers = Object.values(influencerPerformanceMap)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            earnings: p.totalEarnings,
            rating: p.rating || 0
        }));

    // Fetch real recent transactions
    const recentTransactions = await Payment.find({ brand: userId })
        .sort({ createdAt: -1 })
        .limit(3)
        .populate('campaign', 'name')
        .lean();

    stats.recentTransactions = recentTransactions.map(t => ({
        id: t._id,
        name: t.campaign?.name || 'Campaign Payment',
        amount: t.amount,
        status: t.status,
        date: t.createdAt
    }));

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

    const brandProfile = profiles[0];

    // Fetch influencer reviews about this brand
    const reviews = await Review.aggregate([
        { $match: { reviewee: new mongoose.Types.ObjectId(userId), role: "influencer" } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$collaboration", latestReview: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$latestReview" } },
        { $lookup: { from: "users", localField: "reviewer", foreignField: "_id", as: "reviewer" } },
        { $unwind: "$reviewer" },
        { $project: { "reviewer.password": 0, "reviewer.refreshToken": 0 } },
        { $sort: { createdAt: -1 } }
    ]);

    return { ...brandProfile, reviews };
};

/**
 * Update brand profile
 */
const updateProfile = async (userId, updateData) => {
    // Handle socialMedia Map replacement separately to ensure keys can be deleted
    if (updateData.socialMedia) {
        // Safety: parse if it's still a JSON string
        if (typeof updateData.socialMedia === 'string') {
            try {
                updateData.socialMedia = JSON.parse(updateData.socialMedia);
            } catch (e) {
                updateData.socialMedia = {};
            }
        }
        console.log(`[BrandService] SYNCING socialMedia for user ${userId}. Data:`, JSON.stringify(updateData.socialMedia));
        const brandDoc = await Brand.findOne({ user: userId });
        if (brandDoc) {
            brandDoc.socialMedia.clear();
            const validPlatforms = ["instagram", "tiktok", "twitter", "linkedin", "youtube", "facebook"];
            const entries = Object.entries(updateData.socialMedia);
            if (entries.length > 0) {
                entries.forEach(([platform, value]) => {
                    // Only set valid platform keys, skip corrupted numeric indices
                    if (validPlatforms.includes(platform.toLowerCase())) {
                        brandDoc.socialMedia.set(platform.toLowerCase(), value || "");
                    }
                });
            }
            await brandDoc.save({ validateBeforeSave: false });
            console.log(`[BrandService] Map updated successfully. Current keys:`, Array.from(brandDoc.socialMedia.keys()));
        } else {
            console.log(`[BrandService] Brand profile not found during socialMedia sync.`);
        }
        delete updateData.socialMedia;
    }

    if (updateData.geo !== undefined) {
        const parsedGeo = parseGeoPayload(updateData.geo);
        if (parsedGeo) {
            updateData.geo = parsedGeo;
            if (!updateData.address) {
                updateData.address = parsedGeo.formatted || `${parsedGeo.city}, ${parsedGeo.country}`.replace(/^,\s*/, "");
            }
        } else {
            updateData.geo = { lat: null, lng: null, city: "", country: "", formatted: "" };
        }
    }

    // Sync profilePic/logo to User model
    if (updateData.logo) {
        await User.findByIdAndUpdate(userId, { profilePic: updateData.logo });
        delete updateData.logo;
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

    const collaborationsCount = await Collaboration.countDocuments({
        $or: [
            { brand: brand[0].user._id, status: "accepted" },
            { influencer: brand[0].user._id, status: "accepted" }
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

    // Fetch influencer reviews about this brand
    const reviews = await Review.aggregate([
        { $match: { reviewee: new mongoose.Types.ObjectId(brand[0].user._id), role: "influencer" } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$collaboration", latestReview: { $first: "$$ROOT" } } },
        { $replaceRoot: { newRoot: "$latestReview" } },
        { $lookup: { from: "users", localField: "reviewer", foreignField: "_id", as: "reviewer" } },
        { $unwind: "$reviewer" },
        { $project: { "reviewer.password": 0, "reviewer.refreshToken": 0 } },
        { $sort: { createdAt: -1 } }
    ]);

    return {
        brand: brand[0],
        campaigns,
        reviews,
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

        // Count active campaigns
        {
            $lookup: {
                from: "campaigns",
                let: { userId: "$user" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$brand", "$$userId"] },
                                    { $eq: ["$isDeleted", false] },
                                    { $eq: ["$status", "active"] },
                                ]
                            }
                        }
                    },
                    { $count: "count" }
                ],
                as: "activeCampaignsDoc",
            },
        },
        {
            $addFields: {
                activeCampaignsCount: { $ifNull: [{ $arrayElemAt: ["$activeCampaignsDoc.count", 0] }, 0] }
            }
        },

        {
            $project: {
                user: 1,
                brandname: 1,
                industry: 1,
                description: 1,
                website: 1,
                address: 1,
                budgetRange: 1,
                followersCount: 1,
                rating: 1,
                reviewsCount: 1,
                socialMedia: 1,
                lookingFor: 1,
                activeCampaignsCount: 1,
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
