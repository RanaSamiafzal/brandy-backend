import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import Campaign from "../models/campaignModel.js";
import Brand from "../models/brandModel.js";
import { emitActivity } from "../utils/activityUtils.js";
import mongoose from "mongoose";
import { uploadOnCloudinary } from "../config/cloudinary.js";

const createCampaign = AsyncHandler(async (req, res) => {

    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.notFound, "user not found");
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access Denied");
    }

    const { title, description, budget, requirements, deadline, category } = req.body;

    // validation 
    if ([title, description, budget, deadline, category].some((field) => field?.trim() === "")) {
        throw new ApiError(validationStatus.badRequest, "All fields are required");
    }


    const brand = await Brand.findOne({ user: userId });

    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // cloudinary for campaign image
    const imagePath = req.files?.image?.[0]?.path;
    let imageUrl = "";

    if (imagePath) {
        const uploadedImage = await uploadOnCloudinary(imagePath);
        imageUrl = uploadedImage?.url || "";
    }


    const campaign = await Campaign.create({
        title,
        description,
        budget,
        requirements: requirements || [],
        deadline,
        category,
        image: imageUrl,
        brand: brand._id,
    });

    if (!campaign) {
        throw new ApiError(validationStatus.internalError, "Error creating campaign");
    }

    // create brand activity
    await emitActivity({
        user: userId,
        role: "brand",
        type: "campaign_created",
        title: "New Campaign Created",
        description: `You created a new campaign: ${title}`,
        relatedId: campaign._id,
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, campaign, "Campaign created successfully")
    );


});


const getAllCampaigns = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { page = 1, limit = 10, status, search } = req.query;

    const skip = (page - 1) * limit;

    // find brand profile for the user
    // using lean() for better performance as it's a read-only check
    const brand = await Brand.findOne({ user: userId }).select("_id").lean();
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand not found");
    }

    const matchStage = {
        brand: brand._id,
        isDeleted: false,
    };

    if (status) matchStage.status = status;
    if (search) matchStage.title = { $regex: search, $options: "i" };

    const result = await Campaign.aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: Number(limit) }
                ],
                totalCount: [
                    { $count: "count" }
                ]
            }
        }
    ]);

    const campaigns = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return res.status(validationStatus.ok).json(
        new ApiResponse(
            validationStatus.ok,
            {
                campaigns,
                total: totalCount,
                page: Number(page),
                pages: Math.ceil(totalCount / limit)
            },
            "Campaigns fetched successfully"
        )
    );
});


const getCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // [REFACTORED to use findById for better readability]
    const campaign = await Campaign.findOne({ _id: campaignId, isDeleted: false }).lean();

    if (!campaign) {
        throw new ApiError(validationStatus.notFound, "Campaign not found");
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, campaign, "Campaign details fetched successfully")
    );
});


const updateCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // handle image update separately if provided
    if (req.files?.image) {
        const uploadedImage = await uploadOnCloudinary(req.files.image[0].path);
        if (uploadedImage) {
            updateData.image = uploadedImage.url;
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

    // activity log for campaign update
    await emitActivity({
        user: req.user._id,
        role: "brand",
        type: "campaign_updated",
        title: "Campaign Updated",
        description: `You updated the campaign: ${updatedCampaign.title}`,
        relatedId: updatedCampaign._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, updatedCampaign, "Campaign updated successfully")
    );
});


const deleteCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // soft delete campaign
    const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { isDeleted: true },
        { new: true }
    );

    if (!campaign) {
        throw new ApiError(validationStatus.notFound, "Campaign not found");
    }

    // activity log for campaign deletion
    await emitActivity({
        user: req.user._id,
        role: "brand",
        type: "campaign_deleted",
        title: "Campaign Deleted",
        description: `You deleted the campaign: ${campaign.title}`,
        relatedId: campaign._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Campaign deleted successfully")
    );
});

const campaignStatus = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // only allow specific status values for campaign status update 
    if (!["active", "paused", "completed"].includes(status)) {
        throw new ApiError(validationStatus.badRequest, "Invalid status value");
    }

    const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { status },
        { new: true }
    );

    if (!campaign) {
        throw new ApiError(validationStatus.notFound, "Campaign not found");
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, campaign, `Campaign status updated to ${status}`)
    );
});

export {
    createCampaign,
    getAllCampaigns,
    getCampaign,
    updateCampaign,
    deleteCampaign,
    campaignStatus
}
