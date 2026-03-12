import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import Campaign from "../models/campaignModel.js";
import Brand from "../models/brandModel.js";
import Activity from "../models/activityModel.js";
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
    await Activity.create({
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

    // find brand
    const brand = await Brand.findOne({ user: userId });
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand not found");
    }

    // filter by brand from campaigns
    // [MODIFIED to use aggregation pipeline as requested]
    const campaigns = await Campaign.aggregate([
        {
            $match: {
                brand: brand._id,
                isDeleted: false,
            }
        },
        { $sort: { createdAt: -1 } }
    ]);

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, campaigns, "Campaigns fetched successfully")
    );
});


const getCampaign = AsyncHandler(async (req, res) => {
    const { campaignId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid campaignId");
    }

    // [MODIFIED to use aggregation pipeline as requested]
    const campaigns = await Campaign.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(campaignId),
                isDeleted: false,
            }
        },
        { $limit: 1 }
    ]);
    const campaign = campaigns[0];

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
