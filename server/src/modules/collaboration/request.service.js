import Collaboration from './collaboration.model.js';
import Campaign from '../campaign/campaign.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { validationStatus } from '../../utils/ValidationStatusCode.js';
import mongoose from 'mongoose';
import { emitActivity } from '../../utils/activityUtils.js';
import User from '../user/user.model.js';
import Brand from '../brand/brand.model.js';
import Influencer from '../influencer/influencer.model.js';
import { socketManager } from '../../config/socketManager.js';
import Review from './review.model.js';
import { messageService } from '../message/message.service.js';
import { stripeService } from '../payment/stripe.service.js';

/**
 * Send a collaboration request
 */
const sendRequest = async (senderId, { receiverId, campaignId, proposedBudget, note, deliveryDays, initiatedBy }) => {
    if (initiatedBy === "brand") {
        const campaign = await Campaign.findOne({ _id: campaignId, brand: senderId, isDeleted: false });
        if (!campaign) throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    let targetReceiverId = receiverId;
    const userCheck = await User.findById(receiverId).select("_id");
    if (!userCheck) {
        const Influencer = mongoose.model("Influencer");
        const inf = await Influencer.findById(receiverId).select("user");
        if (inf) targetReceiverId = inf.user;
        else {
            const Brand = mongoose.model("Brand");
            const brand = await Brand.findById(receiverId).select("user");
            if (brand) targetReceiverId = brand.user;
        }
    }

    const existingRequest = await Collaboration.findOne({
        $or: [
            { brand: senderId, influencer: targetReceiverId },
            { brand: targetReceiverId, influencer: senderId }
        ],
        campaign: campaignId,
        status: { $in: ["requested", "accepted", "awaiting_funds", "active", "in_progress", "completed"] }
    });

    if (existingRequest) {
        const message = existingRequest.status === "pending"
            ? "A collaboration request is already pending for this campaign"
            : "A collaboration already exists for this campaign";
        throw new ApiError(validationStatus.badRequest, message);
    }

    const request = await Collaboration.create({
        brand: initiatedBy === "brand" ? senderId : targetReceiverId,
        influencer: initiatedBy === "influencer" ? senderId : targetReceiverId,
        sender: senderId,
        initiatedBy: initiatedBy,
        campaign: campaignId,
        proposedBudget,
        note,
        deliveryDays,
    });

    // Emit activity for the receiver
    const receiverUser = await User.findById(request.receiver).select('role');
    const campaign = await Campaign.findById(request.campaign).select('name');

    await emitActivity({
        user: targetReceiverId,
        role: receiverUser?.role || (initiatedBy === 'brand' ? 'influencer' : 'brand'),
        type: 'collaboration_request_sent',
        title: 'New Collaboration Request',
        description: `You have received a new collaboration request for "${campaign?.name || 'a campaign'}"`,
        relatedId: request._id,
        category: 'collaboration' // Changed from 'application' to 'collaboration' for real-time sync
    });

    // Direct socket notification for the receiver to ensure immediate UI update
    socketManager.emitToUser(targetReceiverId, 'collaboration_updated', { 
        collaborationId: request._id, 
        status: request.status,
        type: 'NEW_REQUEST'
    });

    return request;
};

/**
 * Get collaboration requests for a user
 */
const getRequests = async (userId, userRole, { status, type, platform, page = 1, limit = 10, search }) => {
    const skip = (page - 1) * limit;
    const objectUserId = new mongoose.Types.ObjectId(userId.toString());

    // Base match
    let matchStage = {
        $or: [{ brand: objectUserId }, { influencer: objectUserId }],
        isDeleted: false,
        status: { $nin: ["active", "in_progress", "completed", "suspended"] }
    };

    if (type === "sent") {
        matchStage.sender = objectUserId;
    } else if (type === "received") {
        matchStage.sender = { $ne: objectUserId };
    }

    const result = await Collaboration.aggregate([
        { $match: matchStage },
        // Deduplication Logic: Group by campaign and participant pair
        { $sort: { createdAt: -1 } }, // Latest first
        {
            $group: {
                _id: {
                    campaign: "$campaign",
                    brand: "$brand",
                    influencer: "$influencer"
                },
                latestRecord: { $first: "$$ROOT" },
                isRejectedBefore: {
                    $max: {
                        $cond: [{ $in: ["$status", ["rejected", "cancelled"]] }, true, false]
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
        ...(status && status !== "all" ? [{ 
            $match: { 
                status: status === "pending" ? "requested" 
                      : status === "accepted" ? { $in: ["accepted", "awaiting_onboarding", "awaiting_funds"] } 
                      : status 
            } 
        }] : []),

        // Re-apply sort by latest
        { $sort: { createdAt: -1 } },
        // Join with Sender User
        {
            $lookup: {
                from: "users",
                localField: "sender",
                foreignField: "_id",
                as: "senderDetails"
            }
        },
        { $unwind: { path: "$senderDetails", preserveNullAndEmptyArrays: true } },
        // Join with Brand User
        {
            $lookup: {
                from: "users",
                localField: "brand",
                foreignField: "_id",
                as: "brandUser"
            }
        },
        { $unwind: { path: "$brandUser", preserveNullAndEmptyArrays: true } },
        // Join with Influencer User
        {
            $lookup: {
                from: "users",
                localField: "influencer",
                foreignField: "_id",
                as: "influencerUser"
            }
        },
        { $unwind: { path: "$influencerUser", preserveNullAndEmptyArrays: true } },
        // Join with Influencer Profile (for stats)
        {
            $lookup: {
                from: "influencers",
                localField: "influencer",
                foreignField: "user",
                as: "influencerProfile"
            }
        },
        { $unwind: { path: "$influencerProfile", preserveNullAndEmptyArrays: true } },
        // Join with Campaign
        {
            $lookup: {
                from: "campaigns",
                localField: "campaign",
                foreignField: "_id",
                as: "campaignDetails"
            }
        },
        { $unwind: { path: "$campaignDetails", preserveNullAndEmptyArrays: true } },
        // Filter out if campaign is missing or deleted
        {
            $match: {
                campaignDetails: { $exists: true, $ne: null },
                "campaignDetails.isDeleted": { $ne: true }
            }
        },
        // Join with Brand Profile
        {
            $lookup: {
                from: "brands",
                localField: "brand",
                foreignField: "user",
                as: "brandProfile"
            }
        },
        { $unwind: { path: "$brandProfile", preserveNullAndEmptyArrays: true } },
        {
            $addFields: {
                brandDetails: "$brandProfile",
                collaborationId: "$_id",
                // Derive initiatedBy for old records that don't have it stored
                initiatedBy: {
                    $ifNull: [
                        "$initiatedBy",
                        { $cond: [{ $eq: ["$sender", "$brand"] }, "brand", "influencer"] }
                    ]
                }
            },
        },
        // Search filter (Post-Lookup)
        ...(search ? [
            {
                $match: {
                    $or: [
                        { "campaignDetails.name": { $regex: search, $options: "i" } },
                        { "senderDetails.fullname": { $regex: search, $options: "i" } },
                        { "brandUser.fullname": { $regex: search, $options: "i" } },
                        { "influencerUser.username": { $regex: search, $options: "i" } }
                    ]
                }
            }
        ] : []),
        // Sort and Page
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
        requests: result[0].data || [],
        total: totalCount,
        counts: {
            sent: await Collaboration.countDocuments({
                $or: [{ brand: objectUserId }, { influencer: objectUserId }],
                sender: objectUserId,
                status: "requested",
                isDeleted: false
            }),
            received: await Collaboration.countDocuments({
                $or: [{ brand: objectUserId }, { influencer: objectUserId }],
                sender: { $ne: objectUserId },
                status: "requested",
                isDeleted: false
            })
        },
        page: Number(page),
        pages: Math.ceil(totalCount / limit),
    };
};

/**
 * Accept collaboration request - and automatically reject others for the same campaign
 */
const acceptRequest = async (requestId, userId) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const collaboration = await Collaboration.findById(requestId).session(session);
        if (!collaboration) throw new ApiError(validationStatus.notFound, "Request not found");

        // Validation: Only the recipient can accept (the one who didn't send it)
        const isSender = collaboration.sender.toString() === userId.toString();
        if (isSender) {
            throw new ApiError(validationStatus.forbidden, "You cannot accept your own request. Please wait for the other party to respond.");
        }

        // Verify user is actually part of this collaboration
        const isBrand = collaboration.brand.toString() === userId.toString();
        const isInfluencer = collaboration.influencer.toString() === userId.toString();
        if (!isBrand && !isInfluencer) {
            throw new ApiError(validationStatus.forbidden, "Access denied: You are not a party to this collaboration");
        }

        if (collaboration.status !== "requested") throw new ApiError(validationStatus.badRequest, `Request is already ${collaboration.status}`);

        const campaignId = collaboration.campaign;
        const campaign = await Campaign.findById(campaignId).session(session);
        if (campaign.selectedInfluencer) throw new ApiError(validationStatus.badRequest, "Campaign already has a selected influencer");

        // 1. Accept this request -> awaiting_funds
        collaboration.status = "awaiting_funds";
        // Set the agreed budget from the proposed budget so escrow can be funded
        if (collaboration.proposedBudget && !collaboration.agreedBudget) {
            collaboration.agreedBudget = collaboration.proposedBudget;
        }
        await collaboration.save({ session });

        // 2. Reject ALL other pending requests for this campaign
        const otherRequests = await Collaboration.find({
            campaign: campaignId,
            _id: { $ne: requestId },
            status: "requested"
        }).session(session);

        if (otherRequests.length > 0) {
            await Collaboration.updateMany(
                { _id: { $in: otherRequests.map(r => r._id) } },
                {
                    $set: {
                        status: "rejected",
                        rejectionReason: "Another influencer was selected for this campaign",
                        respondedAt: new Date()
                    }
                }
            );

            // Notify each rejected influencer
            for (const req of otherRequests) {
                await emitActivity({
                    user: req.sender,
                    role: "influencer",
                    type: "request_rejected",
                    title: "Request Rejected",
                    description: `Your application for "${campaign?.name || 'a campaign'}" was rejected because another influencer was selected.`,
                    relatedId: req._id,
                    category: "application"
                });
            }
        }

        // 3. Emit activities
        await emitActivity({
            user: collaboration.influencer,
            role: 'influencer',
            type: 'collaboration_accepted',
            title: 'Collaboration Request Accepted',
            description: `Your request for "${campaign?.name || 'a campaign'}" was accepted! Escrow payment is pending.`,
            relatedId: collaboration._id,
            category: 'collaboration'
        });

        const otherPartyId = isBrand ? collaboration.influencer : collaboration.brand;
        const receiverUser = await User.findById(otherPartyId).select('role');
        await emitActivity({
            user: otherPartyId,
            role: receiverUser?.role || (isBrand ? 'influencer' : 'brand'),
            type: 'collaboration_started',
            title: 'Collaboration Started',
            description: `You accepted the request for "${campaign?.name || 'a campaign'}".`,
            relatedId: collaboration._id,
            category: 'collaboration'
        });

        // Create or link conversation
        await messageService.createConversation(
            collaboration.brand,
            collaboration.influencer,
            collaboration.campaign,
            collaboration._id
        );

        // 5. Update campaign status and selected influencer to perfectly sync with the new collaboration's status
        campaign.selectedInfluencer = collaboration.influencer;
        campaign.collaboration = collaboration._id;
        if (campaign.status !== 'active') {
            campaign.status = 'active';
        }
        await campaign.save({ session });

        await session.commitTransaction();

        const collabData = { collaborationId: collaboration._id, status: collaboration.status };
        socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "collaboration_updated", collabData);

        return collaboration;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

/**
 * Reject/Cancel request
 */
const updateRequestStatus = async (requestId, userId, status) => {
    const collaboration = await Collaboration.findById(requestId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Request not found");

    const isSender = collaboration.sender.toString() === userId.toString();
    const isBrand = collaboration.brand.toString() === userId.toString();
    const isInfluencer = collaboration.influencer.toString() === userId.toString();

    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "Access denied: You are not a party to this collaboration");
    }

    if (status === "cancelled" && !isSender) {
        throw new ApiError(validationStatus.forbidden, "Only the sender can cancel their request");
    }
    if (status === "rejected" && isSender) {
        throw new ApiError(validationStatus.forbidden, "You cannot reject your own request. Use 'cancel' instead.");
    }

    collaboration.status = status;
    await collaboration.save();

    const targetUserId = isSender ? (isBrand ? collaboration.influencer : collaboration.brand) : collaboration.sender;
    const targetUser = await User.findById(targetUserId).select('role');
    const campaign = await Campaign.findById(collaboration.campaign).select('name');

    await emitActivity({
        user: targetUserId,
        role: targetUser?.role || 'user',
        type: status === "rejected" ? 'request_rejected' : 'request_cancelled',
        title: `Collaboration Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `The collaboration request for "${campaign?.name || 'a campaign'}" has been ${status}.`,
        relatedId: collaboration._id,
        category: 'application'
    });

    const collabData = { collaborationId: collaboration._id, status: collaboration.status };
    socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "collaboration_updated", collabData);

    return collaboration;
};

/**
 * Influencer/Brand: Send a counter-offer (reconsider)
 */
const counterOffer = async (requestId, userId, { newBudget, note }) => {
    const collaboration = await Collaboration.findById(requestId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Request not found");

    const isInfluencer = collaboration.influencer.toString() === userId.toString();
    const isBrand = collaboration.brand.toString() === userId.toString();

    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "Access denied: You are not a party to this collaboration");
    }

    if (collaboration.status !== "requested") {
        throw new ApiError(validationStatus.badRequest, "Counter-offers can only be made on pending requests");
    }

    // Update the request with new budget and flip the sender
    collaboration.agreedBudget = newBudget;
    collaboration.proposedBudget = newBudget;
    collaboration.sender = userId; // Now I am the sender of this "new" offer
    if (note) collaboration.description = `${collaboration.description}\n\n[Counter Offer Note]: ${note}`;

    await collaboration.save();

    // Notify the other party
    const targetUserId = isBrand ? collaboration.influencer : collaboration.brand;
    const targetUser = await User.findById(targetUserId).select('role');
    const campaign = await Campaign.findById(collaboration.campaign).select('name');

    await emitActivity({
        user: targetUserId,
        role: targetUser?.role || 'user',
        type: 'collaboration_request_sent', // Reuse request type so it shows up in their "Received" tab
        title: 'New Counter Offer Received',
        description: `A counter-offer of $${newBudget} was made for "${campaign?.name || 'a campaign'}"`,
        relatedId: collaboration._id,
        category: 'application'
    });

    const collabData = { collaborationId: collaboration._id, status: collaboration.status, sender: userId };
    socketManager.emitToUsers([collaboration.brand, collaboration.influencer], "collaboration_updated", collabData);

    return collaboration;
};

export const requestService = {
  sendRequest,
  getRequests,
  acceptRequest,
  updateRequestStatus,
  counterOffer
};
