import Campaign from "./campaign.model.js";
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
    const { campaignTimeline } = campaignData;
    const { startDate, endDate } = campaignTimeline || {};
    
    // Status logic
    const status = calculateStatus(startDate, endDate);
    
    const campaign = await Campaign.create({
        ...campaignData,
        status,
    });
    
    return campaign;
};

/**
 * Get all campaigns with filtering and search
 */
const getAllCampaigns = async ({ brand, status, search, page = 1, limit = 10 }) => {
    const query = { isDeleted: false };
    
    if (brand) {
        query.brand = brand;
    }
    
    if (search) {
        // Use text index for search if search string is provided
        query.$text = { $search: search };
    }
    
    if (status) {
        query.status = status;
    }

    const skip = (page - 1) * limit;
    
    const campaigns = await Campaign.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();
        
    const total = await Campaign.countDocuments(query);
    
    // Dynamically update status for each campaign if needed
    const updatedCampaigns = campaigns.map(campaign => {
        const { startDate, endDate } = campaign.campaignTimeline || {};
        const currentStatus = calculateStatus(startDate, endDate);
        return { ...campaign, status: currentStatus };
    });

    return {
        campaigns: updatedCampaigns,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
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
    
    // Recalculate status
    const { startDate, endDate } = campaign.campaignTimeline || {};
    campaign.status = calculateStatus(startDate, endDate);
    
    return campaign;
};

/**
 * Update a campaign
 */
const updateCampaign = async (campaignId, updateData) => {
    // If timeline is updated, recalculate status
    if (updateData.campaignTimeline) {
        const campaign = await Campaign.findById(campaignId);
        if (campaign) {
            const currentTimeline = campaign.campaignTimeline || {};
            const start = updateData.campaignTimeline.startDate || currentTimeline.startDate;
            const end = updateData.campaignTimeline.endDate || currentTimeline.endDate;
            updateData.status = calculateStatus(start, end);
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

export const campaignService = {
    createCampaign,
    getAllCampaigns,
    getCampaignById,
    updateCampaign,
    deleteCampaign,
    calculateStatus,
};
