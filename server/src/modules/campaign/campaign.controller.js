import { campaignService } from "./campaign.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { emitActivity } from "../../utils/activityUtils.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";
import Campaign from "./campaign.model.js";
import CollaborationRequest from "../collaboration/collaboration-request.model.js";

/**
 * Handle campaign creation
 */
const createCampaign = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, "User not authenticated");
    }

    const campaignData = {
        ...req.body,
        brand: userId,
    };

    // Handle image upload if provided
    if (req.files?.image?.[0]?.path) {
        const uploadedImage = await uploadOnCloudinary(req.files.image[0].path);
        campaignData.image = uploadedImage?.url || "";
    }

    const campaign = await campaignService.createCampaign(campaignData);

    // Activity log
    await emitActivity({
        user: userId,
        role: "brand",
        type: "campaign_created",
        title: "New Campaign Created",
        description: `You created a new campaign: ${campaign.name}`,
        relatedId: campaign._id,
        category: 'application'
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, campaign, "Campaign created successfully")
    );
});

/**
 * Handle fetching all campaigns with filtering and search
 */
// const getAllCampaigns = AsyncHandler(async (req, res) => {
//     const { status, search, page, limit } = req.query;
//     const userId = req.user?._id;

//     // Only allow brands to see their own campaigns (this is a business decision, 
//     // maybe influencers should see all active ones. For now, matching previous logic.)
//     const filters = {
//         brand: req.user?.role === "brand" ? userId : null,
//         status,
//         search,
//         page,
//         limit,
//     };

//     const result = await campaignService.getAllCampaigns(filters);

//     return res.status(validationStatus.ok).json(
//         new ApiResponse(validationStatus.ok, result, "Campaigns fetched successfully")
//     );
// });

/**
 * GET /campaigns
 * Brands:      see their own campaigns (all statuses)
 * Influencers: see active campaigns from complete brands only
 * Admin:       see all active campaigns
 */
const getAllCampaigns = AsyncHandler(async (req, res) => {
    const { status, search, page, limit, industry, platform } = req.query;
    const userId = req.user?._id;
    const role = req.user?.role;

    const filters = {
        role,
        brand: role === "brand" ? userId : null,
        status: role === "influencer" ? "active" : status,
        search,
        page,
        limit,
        industry,
        platform,
    };

    const data = await campaignService.getAllCampaigns(filters);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, data, "Campaigns fetched successfully")
    );
});


// // ADD this new controller for apply:
// const applyToCampaign = AsyncHandler(async (req, res) => {
//     const { campaignId } = req.params;
//     const influencerId = req.user._id;
//     const { note, proposedBudget, deliveryDays } = req.body;

//     if (!deliveryDays) {
//         throw new ApiError(validationStatus.badRequest, "Delivery days is required");
//     }

//     // Get campaign to find the brand (receiver)
//     const campaign = await Campaign.findOne({ _id: campaignId, isDeleted: false });
//     if (!campaign) {
//         throw new ApiError(validationStatus.notFound, "Campaign not found");
//     }

//     if (campaign.status !== "active") {
//         throw new ApiError(validationStatus.badRequest, "This campaign is not accepting applications");
//     }

//     // Check if already applied
//     const existing = await CollaborationRequest.findOne({
//         sender: influencerId,
//         campaign: campaignId,
//         status: "pending",
//     });
//     if (existing) {
//         throw new ApiError(validationStatus.badRequest, "You have already applied to this campaign");
//     }

//     const request = await CollaborationRequest.create({
//         initiatedBy: "influencer",
//         sender: influencerId,
//         receiver: campaign.brand, // brand's userId
//         campaign: campaignId,
//         proposedBudget: proposedBudget || campaign.budget.min,
//         note: note || "",
//         deliveryDays,
//         status: "pending",
//     });

//     await emitActivity({
//         user: influencerId,
//         role: "influencer",
//         type: "collaboration_request_sent",
//         title: "Applied to campaign",
//         description: `You applied to "${campaign.name}"`,
//         relatedId: request._id,
//     });

//     return res
//         .status(201)
//         .json(new ApiResponse(201, request, "Application sent successfully"));
// });

/**
 * POST /campaigns/:campaignId/apply
 * Influencer applies to a campaign — creates a CollaborationRequest
 * requireProfileComplete middleware runs before this controller
 */
const applyToCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const influencerId = req.user._id;
    const { note, proposedBudget } = req.body;

    const campaign = await Campaign.findOne({ _id: campaignId, isDeleted: false });
    if (!campaign) {
        throw new ApiError(validationStatus.notFound, "Campaign not found");
    }

    if (campaign.status !== "active") {
        throw new ApiError(validationStatus.badRequest, "This campaign is not accepting applications");
    }

    if (!campaign.brand) {
        throw new ApiError(validationStatus.badRequest, "This campaign is not linked to a valid brand.");
    }

    // Budget Validation
    if (proposedBudget && campaign.budget?.min && Number(proposedBudget) < campaign.budget.min) {
        throw new ApiError(validationStatus.badRequest, `Your proposed budget must be equal or greater than the minimum budget of the campaign ($${campaign.budget.min})`);
    }

    // Prevent duplicate applications
    const existing = await CollaborationRequest.findOne({
        sender: influencerId,
        campaign: campaignId,
        status: { $in: ["pending", "accepted"] },
    });
    if (existing) {
        throw new ApiError(validationStatus.conflict, "You have already applied to this campaign");
    }
    
    // Handle Portfolio Upload
    let uploadedPortfolio = "";
    if (req.files?.portfolio?.[0]?.path) {
        const uploadedFile = await uploadOnCloudinary(req.files.portfolio[0].path);
        uploadedPortfolio = uploadedFile?.url || "";
    }

    let request;
    try {
        request = await CollaborationRequest.create({
            initiatedBy: "influencer",
            sender: influencerId,
            receiver: campaign.brand,   // brand's user ID
            campaign: campaignId,
            proposedBudget: proposedBudget || "",
            note: note || "",
            attachments: uploadedPortfolio ? [uploadedPortfolio] : [],
            status: "pending",
            deliverables: [],           // Explicitly empty array to avoid sub-validation issues
        });
    } catch (err) {
        if (err.code === 11000) {
            throw new ApiError(validationStatus.conflict, "You have already applied to this campaign");
        }
        throw err;
    }

    await emitActivity({
        user: influencerId,
        role: "influencer",
        type: "collaboration_request_sent",
        title: "Applied to campaign",
        description: `You applied to "${campaign.name}"`,
        relatedId: request._id,
        category: 'application'
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, request, "Application sent successfully")
    );
});


/**
 * Handle fetching a single campaign
 */
const getCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const campaign = await campaignService.getCampaignById(campaignId);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, campaign, "Campaign details fetched successfully")
    );
});

/**
 * Handle updating a campaign
 */
const updateCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const updateData = { ...req.body };

    // Handle image update
    if (req.files?.image?.[0]?.path) {
        const uploadedImage = await uploadOnCloudinary(req.files.image[0].path);
        updateData.image = uploadedImage?.url || "";
    }

    const updatedCampaign = await campaignService.updateCampaign(campaignId, updateData);

    // Logging activity
    await emitActivity({
        user: req.user._id,
        role: "brand",
        type: "campaign_updated",
        title: "Campaign Updated",
        description: `You updated the campaign: ${updatedCampaign.name}`,
        relatedId: updatedCampaign._id,
        category: 'application'
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, updatedCampaign, "Campaign updated successfully")
    );
});

/**
 * Handle deleting a campaign
 */
const deleteCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const deletedCampaign = await campaignService.deleteCampaign(campaignId);

    // Logging activity
    await emitActivity({
        user: req.user._id,
        role: "brand",
        type: "campaign_deleted",
        title: "Campaign Deleted",
        description: `You deleted the campaign: ${deletedCampaign.name}`,
        relatedId: deletedCampaign._id,
        category: 'application'
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Campaign deleted successfully")
    );
});

export const campaignController = {
    createCampaign,
    getAllCampaigns,
    getCampaign,
    updateCampaign,
    deleteCampaign,
    applyToCampaign,
};
