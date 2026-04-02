import Campaign from "./campaign.model.js";
import mongoose from "mongoose";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";


/**
 * Calculate campaign status based on current date and timeline
 * @param {Date} startDate 
 * @param {Date} endDate 
 * @returns {string} status
 */
const calculateStatus = (startDate, endDate) => {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now < start) return "pending";
  if (now >= start && now <= end) return "active";
  return "completed";
};

/**
 * Create a new campaign
 */
const createCampaign = async (campaignData) => {
  // If status is provided as draft, use it. Otherwise calculate.
  let status = campaignData.status;

  if (status !== 'draft') {
    const { campaignTimeline } = campaignData;
    const { startDate, endDate } = campaignTimeline || {};
    status = calculateStatus(startDate, endDate);
  }

  const campaign = await Campaign.create({
    ...campaignData,
    status,
  });

  return campaign;
};

/**
 * Get all campaigns with filtering and search
 */
// const getAllCampaigns = async ({ brand, status, search, page = 1, limit = 10 }) => {
//     const query = { isDeleted: false };

//     if (brand) {
//         query.brand = brand;
//     }

//     if (search) {
//         // Use text index for search if search string is provided
//         query.$text = { $search: search };
//     }

//     if (status) {
//         query.status = status;
//     }

//     const skip = (page - 1) * limit;

//     const campaigns = await Campaign.find(query)
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(Number(limit))
//         .lean();

//     const total = await Campaign.countDocuments(query);

//     // Dynamically update status for active/pending/completed campaigns if needed
//     const updatedCampaigns = campaigns.map(campaign => {
//         if (campaign.status === 'draft') return campaign;

//         const { startDate, endDate } = campaign.campaignTimeline || {};
//         const currentStatus = calculateStatus(startDate, endDate);
//         return { ...campaign, status: currentStatus };
//     });

//     return {
//         campaigns: updatedCampaigns,
//         total,
//         page: Number(page),
//         pages: Math.ceil(total / limit)
//     };
// };

// const getAllCampaigns = async ({
//   brand,
//   status,
//   search,
//   industry,
//   platform,
//   page = 1,
//   limit = 10,
// }) => {
//   const query = { isDeleted: false };

//   if (brand)    query.brand = brand;
//   if (status)   query.status = status;
//   if (industry) query.industry = { $regex: industry, $options: "i" };
//   if (platform) query.platform = { $in: [platform] };
//   if (search)   query.$text = { $search: search };

//   const skip = (page - 1) * limit;

//   // Use aggregate to join brand name + logo for influencer explore cards
//   const pipeline = [
//     { $match: query },
//     {
//       $lookup: {
//         from: "brands",
//         localField: "brand",
//         foreignField: "user",
//         as: "brandProfile",
//       },
//     },
//     {
//       $unwind: {
//         path: "$brandProfile",
//         preserveNullAndEmptyArrays: true,
//       },
//     },
//     {
//       $lookup: {
//         from: "users",
//         localField: "brand",
//         foreignField: "_id",
//         as: "brandUser",
//       },
//     },
//     {
//       $unwind: {
//         path: "$brandUser",
//         preserveNullAndEmptyArrays: true,
//       },
//     },
//     {
//       $project: {
//         name: 1,
//         description: 1,
//         industry: 1,
//         platform: 1,
//         budget: 1,
//         campaignTimeline: 1,
//         status: 1,
//         image: 1,
//         targetAudience: 1,
//         deliverables: 1,
//         createdAt: 1,
//         brand: 1,
//         "brandProfile.brandname": 1,
//         "brandProfile.logo": 1,
//         "brandProfile.industry": 1,
//         "brandProfile._id": 1,
//         "brandUser.fullname": 1,
//         "brandUser.profilePic": 1,
//         "brandUser.isVerified": 1,
//       },
//     },
//     { $sort: { createdAt: -1 } },
//     {
//       $facet: {
//         data: [{ $skip: skip }, { $limit: Number(limit) }],
//         totalCount: [{ $count: "count" }],
//       },
//     },
//   ];

//   const result = await Campaign.aggregate(pipeline);
//   const campaigns = result[0]?.data || [];
//   const total = result[0]?.totalCount[0]?.count || 0;

//   // Recalculate status dynamically
//   const updatedCampaigns = campaigns.map((campaign) => {
//     if (campaign.status === "draft") return campaign;
//     const { startDate, endDate } = campaign.campaignTimeline || {};
//     return { ...campaign, status: calculateStatus(startDate, endDate) };
//   });

//   return {
//     campaigns: updatedCampaigns,
//     total,
//     page: Number(page),
//     pages: Math.ceil(total / limit),
//   };
// };

/**
 * Get all campaigns
 * - Brands: see only their own (any status)
 * - Influencers / admin: see only active campaigns from COMPLETE brands
 */


const getAllCampaigns = async ({
  brand,
  status,
  search,
  industry,
  platform,
  page = 1,
  limit = 10,
  role,
}) => {
  const skip = (page - 1) * limit;

  // ── Brand path: simple query, no visibility gate needed ───────────────────
  if (role === "brand" && brand) {
    const query = { isDeleted: false, brand };
    if (status) query.status = status;
    if (industry) query.industry = { $regex: industry, $options: "i" };
    if (platform) query.platform = { $in: [platform] };
    if (search) query.$text = { $search: search };

    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .lean();
    const total = await Campaign.countDocuments(query);

    return {
      campaigns: campaigns.map((c) => ({
        ...c,
        status: c.status === "draft" ? "draft" : calculateStatus(
          c.campaignTimeline?.startDate, c.campaignTimeline?.endDate
        ),
      })),
      total,
      page: Number(page),
      pages: Math.ceil(total / limit),
    };
  }

  // ── Influencer / admin path: aggregate with brand visibility gate ─────────
  const matchStage = { isDeleted: false, status: "active" };
  if (industry) matchStage.industry = { $regex: industry, $options: "i" };
  if (platform) matchStage.platform = { $in: [platform] };
  if (search) matchStage.$text = { $search: search };

  const pipeline = [
    { $match: matchStage },

    // Join User (brand owner) to check profileComplete
    {
      $lookup: {
        from: "users",
        localField: "brand",
        foreignField: "_id",
        as: "brandUser",
      },
    },
    { $unwind: { path: "$brandUser", preserveNullAndEmptyArrays: false } },

    // ── VISIBILITY GATE: only show campaigns from complete, non-blocked brands
    {
      $match: {
        // "brandUser.profileComplete": true,
        "brandUser.isBlocked": false,
      },
    },

    // Join Brand profile for name + logo on cards
    {
      $lookup: {
        from: "brands",
        localField: "brand",
        foreignField: "user",
        as: "brandProfile",
      },
    },
    { $unwind: { path: "$brandProfile", preserveNullAndEmptyArrays: true } },

    // Join CollaborationRequest to get dynamic applicant count
    {
      $lookup: {
        from: "collaborationrequests",
        localField: "_id",
        foreignField: "campaign",
        as: "applicants",
      },
    },
    {
      $addFields: {
        applicantsCount: { $size: "$applicants" }
      }
    },

    {
      $project: {
        name: 1,
        description: 1,
        industry: 1,
        platform: 1,
        budget: 1,
        campaignTimeline: 1,
        status: 1,
        image: 1,
        targetAudience: 1,
        deliverables: 1,
        additionalRequirements: 1,
        goals: 1,
        competitionLevel: 1,
        applicantsCount: 1,
        createdAt: 1,
        brand: 1,
        "brandProfile.brandname": 1,
        "brandProfile.logo": 1,
        "brandProfile.industry": 1,
        "brandProfile._id": 1,
        "brandUser.fullname": 1,
        "brandUser.profilePic": 1,
        "brandUser.isVerified": 1,
      },
    },

    { $sort: { createdAt: -1 } },

    {
      $facet: {
        data: [{ $skip: skip }, { $limit: Number(limit) }],
        totalCount: [{ $count: "count" }],
      },
    },
  ];

  const result = await Campaign.aggregate(pipeline);
  const campaigns = result[0]?.data || [];
  const total = result[0]?.totalCount[0]?.count || 0;

  return {
    campaigns: campaigns.map((c) => ({
      ...c,
      status: calculateStatus(c.campaignTimeline?.startDate, c.campaignTimeline?.endDate),
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
};


/**
 * Get a single campaign by ID
 */
const getCampaignById = async (campaignId) => {
  const campaign = await Campaign.findOne({ _id: campaignId, isDeleted: false }).lean();

  if (!campaign) {
    throw new ApiError(validationStatus.notFound, "Campaign not found");
  }

  if (campaign.status !== 'draft') {
    const { startDate, endDate } = campaign.campaignTimeline || {};
    campaign.status = calculateStatus(startDate, endDate);
  }

  // Dynamic applicant count for single view
  const CollaborationRequest = mongoose.model("CollaborationRequest"); 
  campaign.applicantsCount = await CollaborationRequest.countDocuments({
    campaign: campaignId,
  });

  return campaign;
};

/**
 * Update a campaign
 */
const updateCampaign = async (campaignId, updateData) => {
  // If timeline is updated or status is being changed from draft
  const campaign = await Campaign.findById(campaignId);
  if (campaign) {
    // If we are explicitly setting a status (like 'draft'), keep it
    // Otherwise, if it was a draft and we're adding a timeline, or it's not a draft, calculate.
    if (updateData.status && updateData.status === 'draft') {
      // Keep as draft
    } else if (updateData.campaignTimeline || campaign.status !== 'draft') {
      const currentTimeline = campaign.campaignTimeline || {};
      const start = updateData.campaignTimeline?.startDate || currentTimeline.startDate;
      const end = updateData.campaignTimeline?.endDate || currentTimeline.endDate;

      if (start && end) {
        updateData.status = calculateStatus(start, end);
      }
    }
  }

  const updatedCampaign = await Campaign.findByIdAndUpdate(
    campaignId,
    { $set: updateData },
    { new: true }
  );

  if (!updatedCampaign) {
    throw new ApiError(validationStatus.notFound, "Campaign not found");
  }

  return updatedCampaign;
};

/**
 * Soft delete a campaign
 */
const deleteCampaign = async (campaignId) => {
  const campaign = await Campaign.findByIdAndUpdate(
    campaignId,
    { isDeleted: true },
    { new: true }
  );

  if (!campaign) {
    throw new ApiError(validationStatus.notFound, "Campaign not found");
  }

  return campaign;
};

/**
 * Apply to a campaign
 */
const applyToCampaign = async (campaignId, influencerId, data) => {
  const campaign = await Campaign.findOne({ _id: campaignId, isDeleted: false });
  if (!campaign) {
    throw new ApiError(validationStatus.notFound, "Campaign not found");
  }

  if (campaign.status !== "active") {
    throw new ApiError(validationStatus.badRequest, "This campaign is not accepting applications");
  }

  const existing = await CollaborationRequest.findOne({
    sender: influencerId,
    campaign: campaignId,
    status: "pending",
  });
  if (existing) {
    throw new ApiError(validationStatus.badRequest, "You have already applied to this campaign");
  }

  const request = await CollaborationRequest.create({
    initiatedBy: "influencer",
    sender: influencerId,
    receiver: campaign.brand,
    campaign: campaignId,
    proposedBudget: data.proposedBudget || campaign.budget.min,
    note: data.note || "",
    deliveryDays: data.deliveryDays,
    status: "pending",
  });

  await emitActivity({
    user: influencerId,
    role: "influencer",
    type: "collaboration_request_sent",
    title: "Applied to campaign",
    description: `You applied to "${campaign.name}"`,
    relatedId: request._id,
  });

  return request;
};


export const campaignService = {
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  calculateStatus,
  applyToCampaign,
};
