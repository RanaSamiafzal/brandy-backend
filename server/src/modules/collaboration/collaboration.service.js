import CollaborationRequest from "./collaboration-request.model.js";
import Collaboration from "./collaboration.model.js";
import Campaign from "../campaign/campaign.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import mongoose from "mongoose";
import { emitActivity } from "../../utils/activityUtils.js";
import User from "../user/user.model.js";

/**
 * Send a collaboration request
 */
const sendRequest = async (senderId, { receiverId, campaignId, proposedBudget, note, deliveryDays, initiatedBy }) => {
    // Check if campaign exists and belongs to sender (if brand)
    if (initiatedBy === "brand") {
        const campaign = await Campaign.findOne({ _id: campaignId, brand: senderId, isDeleted: false });
        if (!campaign) throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    // Check for existing pending or accepted request for this campaign between these two users
    const existingRequest = await CollaborationRequest.findOne({
        $or: [
            { sender: senderId, receiver: receiverId },
            { sender: receiverId, receiver: senderId }
        ],
        campaign: campaignId,
        status: { $in: ["pending", "accepted"] }
    });
    
    if (existingRequest) {
        const message = existingRequest.status === "pending" 
            ? "A collaboration request is already pending for this campaign"
            : "A collaboration already exists for this campaign";
        throw new ApiError(validationStatus.badRequest, message);
    }

    const request = await CollaborationRequest.create({
        initiatedBy,
        sender: senderId,
        receiver: receiverId,
        campaign: campaignId,
        proposedBudget,
        note,
        deliveryDays,
    });

    // Emit activity for the receiver
    const receiverUser = await User.findById(request.receiver).select('role');
    const campaign = await Campaign.findById(request.campaign).select('name');
    
    await emitActivity({
        user: request.receiver,
        role: receiverUser?.role || (initiatedBy === 'brand' ? 'influencer' : 'brand'),
        type: 'collaboration_request_sent',
        title: 'New Collaboration Request',
        description: `You have received a new collaboration request for "${campaign?.name || 'a campaign'}"`,
        relatedId: request._id,
        category: 'application'
    });

    return request;
};

/**
 * Get collaboration requests for a user
 */
const getRequests = async (userId, { status, type, platform, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;
    
    // Base match based on type
    let matchStage = {};
    const objectUserId = new mongoose.Types.ObjectId(userId.toString());

    if (type === "sent") {
        matchStage.sender = objectUserId;
    } else if (type === "received") {
        matchStage.receiver = objectUserId;
    } else {
        matchStage.$or = [
            { sender: objectUserId },
            { receiver: objectUserId }
        ];
    }

    // Initial Match (User & Deletion)
    const initialMatch = { ...matchStage };
    delete initialMatch.status; // We will filter status AFTER grouping

    const result = await CollaborationRequest.aggregate([
        { $match: initialMatch },
        // Deduplication Logic: Group by campaign and participant pair
        { $sort: { createdAt: -1 } }, // Latest first
        {
            $group: {
                _id: { 
                    campaign: "$campaign", 
                    sender: "$sender", 
                    receiver: "$receiver" 
                },
                latestRecord: { $first: "$$ROOT" },
                isRejectedBefore: { 
                    $max: { 
                        $cond: [ { $in: ["$status", ["rejected", "cancelled"]] }, true, false ] 
                    } 
                }
            }
        },
        {
            $replaceRoot: {
                newRoot: {
                    $mergeObjects: ["$latestRecord", { previouslyRejected: "$isRejectedBefore" }]
                }
            }
        },
        // NEW: Filter status AFTER grouping to ensure we only see the "Latest" status
        ...(status && status !== "all" ? [{ $match: { status: status } }] : []),
        
        // Re-apply sort by latest
        { $sort: { createdAt: -1 } },
        // Join with sender details
        {
            $lookup: {
                from: "users",
                localField: "sender",
                foreignField: "_id",
                as: "senderDetails",
            },
        },
        { $unwind: { path: "$senderDetails", preserveNullAndEmptyArrays: true } },
        // Join with receiver details
        {
            $lookup: {
                from: "users",
                localField: "receiver",
                foreignField: "_id",
                as: "receiverDetails",
            },
        },
        { $unwind: { path: "$receiverDetails", preserveNullAndEmptyArrays: true } },
        // Join with Campaign
        {
            $lookup: {
                from: "campaigns",
                localField: "campaign",
                foreignField: "_id",
                as: "campaignDetails",
            },
        },
        { $unwind: { path: "$campaignDetails", preserveNullAndEmptyArrays: true } },
        // Join with Influencer Profile (for whoever is the influencer)
        {
            $lookup: {
                from: "influencers",
                let: { senderId: "$sender", receiverId: "$receiver" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $eq: ["$user", "$$senderId"] },
                                    { $eq: ["$user", "$$receiverId"] },
                                    { $eq: ["$_id", "$$senderId"] },
                                    { $eq: ["$_id", "$$receiverId"] },
                                ],
                            },
                        },
                    },
                    {
                        $lookup: {
                            from: "users",
                            localField: "user",
                            foreignField: "_id",
                            as: "userData"
                        }
                    },
                    { $addFields: { userData: { $arrayElemAt: ["$userData", 0] } } }
                ],
                as: "influencerProfile",
            },
        },
        {
            $addFields: {
                influencerDetails: { $arrayElemAt: ["$influencerProfile", 0] },
            },
        },
        // Platform filter
        ...(platform && platform !== "all" ? [
            {
                $match: {
                    "influencerDetails.platforms.name": { $regex: platform, $options: "i" }
                }
            }
        ] : []),
        // Join with Brand Profile (for whoever is the brand)
        {
            $lookup: {
                from: "brands",
                let: { senderId: "$sender", receiverId: "$receiver" },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $or: [
                                    { $eq: ["$user", "$$senderId"] },
                                    { $eq: ["$user", "$$receiverId"] },
                                ],
                            },
                        },
                    },
                ],
                as: "brandProfile",
            },
        },
        {
            $addFields: {
                brandDetails: { $arrayElemAt: ["$brandProfile", 0] },
            },
        },
        // Join with Collaboration to get ID if accepted
        {
            $lookup: {
                from: "collaborations",
                localField: "_id",
                foreignField: "request",
                as: "collaborationInfo"
            }
        },
        { $unwind: { path: "$collaborationInfo", preserveNullAndEmptyArrays: true } },
        { 
            $addFields: { 
                collaborationId: "$collaborationInfo._id" 
            } 
        },
        // Sort and Page
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    // Separate counts for tabs (Sent vs Received)
    const sentCount = await CollaborationRequest.countDocuments({ sender: userId });
    const receivedCount = await CollaborationRequest.countDocuments({ receiver: userId });

    const requests = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
        requests,
        total: totalCount,
        counts: {
            sent: sentCount,
            received: receivedCount
        },
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

    // Emit activity for the sender (the one who initiated the now-accepted request)
    const senderUser = await User.findById(request.sender).select('role');
    await emitActivity({
        user: request.sender,
        role: senderUser?.role || (request.initiatedBy === 'brand' ? 'brand' : 'influencer'),
        type: 'collaboration_accepted',
        title: 'Collaboration Request Accepted',
        description: `Your request for "${campaign?.name || 'a campaign'}" was accepted!`,
        relatedId: collaboration._id,
        category: 'collaboration'
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

    // Emit activity for the other party
    const isSenderAction = request.sender.toString() === userId.toString();
    const targetUserId = isSenderAction ? request.receiver : request.sender;
    const targetUser = await User.findById(targetUserId).select('role');
    const campaign = await Campaign.findById(request.campaign).select('name');
    
    await emitActivity({
        user: targetUserId,
        role: targetUser?.role || 'user',
        type: status === "rejected" ? 'request_rejected' : 'request_cancelled',
        title: `Collaboration Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `The collaboration request for "${campaign?.name || 'a campaign'}" has been ${status}.`,
        relatedId: request._id,
        category: 'application'
    });

    return request;
};

export const collaborationService = {
    sendRequest,
    getRequests,
    acceptRequest,
    updateRequestStatus,
};
