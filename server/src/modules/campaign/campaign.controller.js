import { campaignService } from "./campaign.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { emitActivity } from "../../utils/activityUtils.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";

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
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, campaign, "Campaign created successfully")
    );
});

/**
 * Handle fetching all campaigns with filtering and search
 */
const getAllCampaigns = AsyncHandler(async (req, res) => {
    const { status, search, page, limit } = req.query;
    const userId = req.user?._id;

    // Only allow brands to see their own campaigns (this is a business decision, 
    // maybe influencers should see all active ones. For now, matching previous logic.)
    const filters = {
        brand: req.user?.role === "brand" ? userId : null,
        status,
        search,
        page,
        limit,
    };

    const result = await campaignService.getAllCampaigns(filters);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Campaigns fetched successfully")
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
};
