import CollaborationRequest from "./collaboration-request.model.js";
import Collaboration from "./collaboration.model.js";
import Campaign from "../campaign/campaign.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import mongoose from "mongoose";

/**
 * Send a collaboration request
 */
const sendRequest = async (senderId, { receiverId, campaignId, proposedBudget, note, deliveryDays, initiatedBy }) => {
    // Check if campaign exists and belongs to sender (if brand)
    if (initiatedBy === "brand") {
        const campaign = await Campaign.findOne({ _id: campaignId, brand: senderId, isDeleted: false });
        if (!campaign) throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    // Check for existing pending request
    const existingRequest = await CollaborationRequest.findOne({
        sender: senderId,
        receiver: receiverId,
        campaign: campaignId,
        status: "pending"
    });
    if (existingRequest) throw new ApiError(validationStatus.badRequest, "Collaboration request already pending");

    const request = await CollaborationRequest.create({
        initiatedBy,
        sender: senderId,
        receiver: receiverId,
        campaign: campaignId,
        proposedBudget,
        note,
        deliveryDays,
    });
    return request;
};

/**
 * Get collaboration requests for a user
 */
const getRequests = async (userId, { status, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;
    const matchStage = { $or: [{ sender: userId }, { receiver: userId }] };
    if (status) matchStage.status = status;

    const result = await CollaborationRequest.aggregate([
        { $match: matchStage },
        { $lookup: { from: 'users', localField: 'sender', foreignField: '_id', as: "senderUser" } },
        { $unwind: '$senderUser' },
        { $lookup: { from: 'users', localField: 'receiver', foreignField: '_id', as: "receiverUser" } },
        { $unwind: '$receiverUser' },
        { $lookup: { from: 'campaigns', localField: 'campaign', foreignField: '_id', as: 'campaignData' } },
        { $unwind: '$campaignData' },
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            }
        }
    ]);

    const requests = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
        requests,
        total: totalCount,
        page: Number(page),
        pages: Math.ceil(totalCount / limit),
    };
};

/**
 * Accept collaboration request
 */
const acceptRequest = async (requestId, userId) => {
    const request = await CollaborationRequest.findById(requestId);
    if (!request || request.receiver.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.notFound, "Request not found or access denied");
    }
    if (request.status !== "pending") throw new ApiError(validationStatus.badRequest, `Request is already ${request.status}`);

    request.status = "accepted";
    request.respondedAt = new Date();
    await request.save();

    const campaign = await Campaign.findById(request.campaign);
    const collaboration = await Collaboration.create({
        brand: request.initiatedBy === "brand" ? request.sender : request.receiver,
        influencer: request.initiatedBy === "influencer" ? request.sender : request.receiver,
        campaign: request.campaign,
        request: request._id,
        title: campaign?.name || "New Collaboration",
        description: campaign?.description || "",
        agreedBudget: request.proposedBudget || 0,
        status: "active",
    });

    return { request, collaboration };
};

/**
 * Reject/Cancel request
 */
const updateRequestStatus = async (requestId, userId, status) => {
    const request = await CollaborationRequest.findById(requestId);
    if (!request) throw new ApiError(validationStatus.notFound, "Request not found");

    const isSender = request.sender.toString() === userId.toString();
    const isReceiver = request.receiver.toString() === userId.toString();

    if (status === "cancelled" && !isSender) throw new ApiError(validationStatus.forbidden, "Only sender can cancel");
    if (status === "rejected" && !isReceiver) throw new ApiError(validationStatus.forbidden, "Only receiver can reject");

    request.status = status;
    request.respondedAt = new Date();
    await request.save();
    return request;
};

export const collaborationService = {
    sendRequest,
    getRequests,
    acceptRequest,
    updateRequestStatus,
};
