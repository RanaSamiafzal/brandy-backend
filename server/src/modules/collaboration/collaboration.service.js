import Collaboration from "./collaboration.model.js";
import Campaign from "../campaign/campaign.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import mongoose from "mongoose";
import { emitActivity } from "../../utils/activityUtils.js";
import User from "../user/user.model.js";
import Brand from "../brand/brand.model.js";
import Influencer from "../influencer/influencer.model.js";
import Review from "./review.model.js";
import { messageService } from "../message/message.service.js";
import { stripeService } from "../payment/stripe.service.js";

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
        category: 'application'
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
        isDeleted: false
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
        ...(status && status !== "all" ? [{ $match: { status: status } }] : []),

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

        // 5. Update campaign status to perfectly sync with the new collaboration's status ('active')
        if (campaign && campaign.status !== 'active') {
            campaign.status = 'active';
            await campaign.save({ session });
        }

        await session.commitTransaction();
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

    return collaboration;
};

/**
 * Update active collaboration status (cancel/complete)
 */
const updateCollaborationStatus = async (id, userId, status, reason = "") => {
    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    const isBrand = collaboration.brand.toString() === userId.toString();
    const isInfluencer = collaboration.influencer.toString() === userId.toString();

    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "Access denied");
    }

    if (status === "completed" && !isBrand) {
        throw new ApiError(validationStatus.forbidden, "Only brands can mark as completed");
    }

    if (status === "cancelled") {
        if (!isBrand) throw new ApiError(validationStatus.forbidden, "Only brands can cancel an active collaboration");

        const ongoingTasks = collaboration.deliverables?.filter(d =>
            ["SUBMITTED", "IN_PROGRESS"].includes(d.status)
        );

        if (ongoingTasks?.length > 0) {
            throw new ApiError(validationStatus.badRequest, "Cannot cancel the collaboration while there are ongoing or submitted tasks. Please approve or resolve them first.");
        }
    }

    collaboration.status = status;
    if (status === "cancelled") {
        collaboration.cancellationReason = reason || "No reason provided";
        collaboration.cancelledBy = userId;
    }
    await collaboration.save();

    // Sync campaign status exactly with collaboration status
    if (collaboration.campaign) {
        const campaign = await Campaign.findById(collaboration.campaign);
        if (campaign) {
            campaign.status = status;
            await campaign.save();
        }
    }

    // Notify the other party
    const targetUserId = isBrand ? collaboration.influencer : collaboration.brand;
    const targetUser = await User.findById(targetUserId).select('role');

    await emitActivity({
        user: targetUserId,
        role: targetUser?.role || 'user',
        type: `collaboration_${status}`,
        title: `Collaboration ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        description: `The collaboration has been ${status}. ${reason ? 'Reason: ' + reason : ''}`,
        relatedId: collaboration._id,
        category: 'collaboration'
    });

    return collaboration;
};

/**
 * Get all collaborations for a user
 */
const getCollaborations = async (userId, { status, page = 1, limit = 10 }) => {
    const skip = (page - 1) * limit;
    const objectUserId = new mongoose.Types.ObjectId(userId.toString());

    const matchStage = {
        isDeleted: false,
        status: { $nin: ["requested", "rejected"] },
        $or: [
            { brand: objectUserId },
            { influencer: objectUserId }
        ]
    };

    if (status && status !== "all") {
        matchStage.status = status;
    }

    const result = await Collaboration.aggregate([
        { $match: matchStage },
        { $sort: { createdAt: -1 } },
        // Join with Brand User
        {
            $lookup: {
                from: "users",
                localField: "brand",
                foreignField: "_id",
                as: "brandUser"
            }
        },
        { $unwind: "$brandUser" },
        // Join with Influencer User
        {
            $lookup: {
                from: "users",
                localField: "influencer",
                foreignField: "_id",
                as: "influencerUser"
            }
        },
        { $unwind: "$influencerUser" },
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
        // Join with Review
        {
            $lookup: {
                from: "reviews",
                localField: "review",
                foreignField: "_id",
                as: "reviewDetails"
            }
        },
        { $unwind: { path: "$reviewDetails", preserveNullAndEmptyArrays: true } },
        // Join with Influencer Review (Influencer's review of Brand)
        {
            $lookup: {
                from: "reviews",
                localField: "influencerReview",
                foreignField: "_id",
                as: "influencerReviewDetails"
            }
        },
        { $unwind: { path: "$influencerReviewDetails", preserveNullAndEmptyArrays: true } },
        // Project final structure
        {
            $project: {
                _id: 1,
                title: 1,
                status: 1,
                agreedBudget: 1,
                totalPaidAmount: 1,
                createdAt: 1,
                updatedAt: 1,
                brand: {
                    id: "$brandUser._id",
                    name: "$brandUser.fullname",
                    avatar: "$brandUser.profilePic"
                },
                influencer: {
                    id: "$influencerUser._id",
                    name: "$influencerUser.fullname",
                    username: "$influencerUser.username",
                    avatar: "$influencerUser.profilePic"
                },
                campaign: {
                    id: "$campaignDetails._id",
                    name: "$campaignDetails.name",
                    image: "$campaignDetails.image"
                },
                deliverablesSummary: {
                    total: {
                        $size: { $ifNull: ["$deliverables", []] }
                    },
                    completed: {
                        $size: {
                            $filter: {
                                input: { $ifNull: ["$deliverables", []] },
                                as: "d",
                                cond: { $in: ["$$d.status", ["APPROVED", "DELIVERED"]] }
                            }
                        }
                    }
                },
                deliverables: {
                    $map: {
                        input: { $ifNull: ["$deliverables", []] },
                        as: "d",
                        in: {
                            _id: "$$d._id",
                            title: "$$d.title",
                            status: "$$d.status",
                            dueDate: "$$d.dueDate",
                            priority: "$$d.priority",
                            allocatedBudget: "$$d.allocatedBudget",
                            paymentStatus: "$$d.paymentStatus",
                            isFinal: "$$d.isFinal"
                        }
                    }
                },
                startDate: 1,
                endDate: 1,
                paymentStatus: 1,
                review: "$reviewDetails",
                influencerReview: "$influencerReviewDetails"
            }
        },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    const collaborations = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return {
        collaborations,
        total: totalCount,
        page: Number(page),
        pages: Math.ceil(totalCount / limit),
    };
};

/**
 * Get single collaboration details
 */
const getCollaborationDetails = async (id, userId) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(validationStatus.badRequest, "Invalid collaboration ID");
    }

    const collaboration = await Collaboration.findOne({
        _id: id,
        isDeleted: false,
        $or: [
            { brand: userId },
            { influencer: userId }
        ]
    })
        .populate("brand", "fullname email profilePic")
        .populate("influencer", "fullname username email profilePic")
        .populate("campaign", "name description image platform endDate")
        .populate({ path: "review", model: "Review" })
        .populate({ path: "influencerReview", model: "Review" })
        .lean();

    if (!collaboration) {
        throw new ApiError(validationStatus.notFound, "Collaboration not found");
    }

    // Fetch influencer profile for stats
    const Influencer = mongoose.model("Influencer");
    const influencerProfile = await Influencer.findOne({ user: collaboration.influencer._id }).select("followersCount platforms");

    return collaboration;
};

/**
 * Submit an action request (CANCEL, COMPLETE, RESUME)
 */
const submitActionRequest = async (id, userId, { type, reason }) => {
    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    const isBrand = collaboration.brand.toString() === userId.toString();
    const isInfluencer = collaboration.influencer.toString() === userId.toString();

    if (!isBrand && !isInfluencer) throw new ApiError(validationStatus.forbidden, "Access denied");

    // Don't allow multiple pending requests
    if (collaboration.actionRequest?.status === "PENDING") {
        throw new ApiError(validationStatus.badRequest, "There is already a pending request for this collaboration");
    }

    // Only brands can cancel an active collaboration
    if (type === "CANCEL" && !isBrand) {
        throw new ApiError(validationStatus.forbidden, "Only brands can initiate a cancellation request for an active collaboration");
    }

    // Cancellation/Completion checks for deliverables
    if (type === "CANCEL" || type === "COMPLETE") {
        const ongoingTasks = collaboration.deliverables?.filter(d =>
            ["SUBMITTED", "IN_PROGRESS"].includes(d.status)
        );

        if (ongoingTasks?.length > 0) {
            const taskType = type === "CANCEL" ? "cancelled" : "completed";
            throw new ApiError(validationStatus.badRequest, `Cannot ${type.toLowerCase()} the collaboration while there are ongoing or submitted tasks. Please approve or resolve them first.`);
        }
    }

    if (type === "COMPLETE") {
        const total = collaboration.deliverables?.length || 0;
        const approved = collaboration.deliverables?.filter(d =>
            ["APPROVED", "DELIVERED"].includes(d.status)
        ).length || 0;

        if (total > 0 && approved < total) {
            throw new ApiError(validationStatus.badRequest, "Cannot request completion until all deliverables are approved");
        }
    }

    collaboration.actionRequest = {
        type,
        requestedBy: userId,
        reason,
        status: "PENDING",
        requestedAt: new Date()
    };

    await collaboration.save();

    // Notify the other party
    const targetUserId = isBrand ? collaboration.influencer : collaboration.brand;
    const targetRole = isBrand ? "influencer" : "brand";

    await emitActivity({
        user: targetUserId,
        role: targetRole,
        type: `collab_request_${type.toLowerCase()}`,
        title: `${type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()} Request`,
        description: `The ${isBrand ? 'brand' : 'influencer'} has requested to ${type.toLowerCase()} the collaboration. Reason: ${reason}`,
        relatedId: collaboration._id,
        category: 'collaboration'
    });

    return collaboration;
};

/**
 * Handle an action request (Approve/Reject)
 */
const handleActionRequest = async (id, userId, { decision, reviewData = null }) => {
    const collaboration = await Collaboration.findById(id).populate("brand influencer");
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (!collaboration.actionRequest || collaboration.actionRequest.status !== "PENDING") {
        throw new ApiError(validationStatus.badRequest, "No pending request found");
    }

    // Only the party who DID NOT request it can handle it
    if (collaboration.actionRequest.requestedBy.toString() === userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "You cannot approve your own request");
    }

    const { type, reason, requestedBy } = collaboration.actionRequest;

    if (decision === "REJECTED") {
        collaboration.actionRequest.status = "REJECTED";
        await collaboration.save();

        await emitActivity({
            user: requestedBy,
            role: userId === collaboration.brand._id.toString() ? "influencer" : "brand",
            type: "collab_request_rejected",
            title: "Request Rejected",
            description: `Your request to ${type.toLowerCase()} was rejected.`,
            relatedId: collaboration._id,
            category: "collaboration"
        });

        return collaboration;
    }

    // APPROVAL LOGIC
    collaboration.actionRequest.status = "APPROVED";

    if (type === "CANCEL") {
        collaboration.status = "cancelled";
        collaboration.cancellationReason = reason;
        collaboration.cancelledBy = requestedBy;

        // --- CANCELLATION RULE ---
        // If deliverable.status === 'IN_PROGRESS' AND inProgressAt >= 24 hours 
        // Then brand MUST pay for that task upon cancellation
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        for (const deliverable of collaboration.deliverables) {
            if (deliverable.status === "IN_PROGRESS" && deliverable.inProgressAt <= twentyFourHoursAgo) {
                console.log(`💰 Cancellation payout triggered for deliverable: ${deliverable._id}`);
                // Mark as approved to satisfy transfer service requirement
                deliverable.status = "APPROVED";
                deliverable.approvedAt = now;

                // We will trigger the transfer after the main update to avoid nested transaction issues if possible, 
                // or handle it within the same flow if stripeService allows.
                // Since stripeService handles its own session, we'll call it after save or use a unified session.
            }
        }
    } else if (type === "COMPLETE") {
        collaboration.status = "completed";
        collaboration.completedAt = new Date();
        collaboration.completedBy = requestedBy;

        // If review data was provided in the approval step (for brand)
        if (reviewData && reviewData.rating) {
            const review = await Review.create({
                reviewer: userId, // The brand who is approving
                reviewee: requestedBy, // The influencer who requested completion
                collaboration: collaboration._id,
                rating: reviewData.rating,
                comment: reviewData.comment || "",
                role: "brand"
            });
            collaboration.review = review._id;

            // Update influencer average rating
            const influencerProfile = await Influencer.findOne({ user: requestedBy });
            if (influencerProfile) {
                const allReviews = await Review.find({ reviewee: requestedBy, role: "brand" });
                const avg = allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;
                influencerProfile.averageRating = parseFloat(avg.toFixed(1));
                influencerProfile.reviewsCount = allReviews.length;
                await influencerProfile.save();
            }
        }
    } else if (type === "RESUME") {
        collaboration.status = "active";
    }

    const updatedCollab = await collaboration.save();

    // Trigger payouts for any deliverables marked as APPROVED during cancellation
    if (type === "CANCEL") {
        for (const deliverable of updatedCollab.deliverables) {
            if (deliverable.status === "APPROVED" && deliverable.paymentStatus === "unpaid") {
                try {
                    await stripeService.transferDeliverablePayout(updatedCollab._id, deliverable._id);
                } catch (err) {
                    console.error(`Failed to pay influencer for deliverable ${deliverable._id} during cancellation:`, err.message);
                }
            }
        }
    }

    const populatedCollab = await Collaboration.findById(updatedCollab._id)
        .populate("brand influencer campaign review");

    await emitActivity({
        user: requestedBy,
        role: userId === collaboration.brand._id.toString() ? "influencer" : "brand",
        type: "collab_request_approved",
        title: "Request Approved",
        description: `Your request to ${type.toLowerCase()} has been approved. Status is now: ${updatedCollab.status}`,
        relatedId: updatedCollab._id,
        category: "collaboration"
    });

    // Sync campaign status
    if (updatedCollab.campaign) {
        const campaign = await Campaign.findById(updatedCollab.campaign._id || updatedCollab.campaign);
        if (campaign) {
            if (type === "COMPLETE") campaign.status = "completed";
            else if (type === "CANCEL") campaign.status = "cancelled";
            else if (type === "RESUME") campaign.status = "in_progress";
            await campaign.save();
        }
    }

    return collaboration;
};

/**
 * Finalize/Complete collaboration with review
 */
const completeCollaboration = async (id, userId, reviewData) => {
    const collaboration = await Collaboration.findById(id).populate("brand influencer campaign");
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    const isBrand = collaboration.brand._id.toString() === userId.toString();
    if (!isBrand) throw new ApiError(validationStatus.forbidden, "Only brands can finalize completion and leave reviews");

    // Completion requires all deliverables to be APPROVED
    const total = collaboration.deliverables?.length || 0;
    const approved = collaboration.deliverables?.filter(d =>
        ["APPROVED", "DELIVERED", "SUBMITTED"].includes(d.status) // Be slightly flexible or strict? strict is better
    ).length || 0;

    // Check if there are deliverables at all. If yes, they must be approved.
    const allApproved = collaboration.deliverables.every(d => ["APPROVED", "DELIVERED"].includes(d.status));

    if (collaboration.deliverables.length > 0 && !allApproved) {
        throw new ApiError(validationStatus.badRequest, "Cannot complete until all deliverables are approved");
    }

    // Create Review if provided
    let reviewId = null;
    if (reviewData && reviewData.rating) {
        const review = await Review.create({
            reviewer: userId,
            reviewee: collaboration.influencer._id,
            collaboration: collaboration._id,
            rating: reviewData.rating,
            comment: reviewData.comment || "",
            role: "brand"
        });
        reviewId = review._id;
    }

    const updatedCollab = await Collaboration.findByIdAndUpdate(id, {
        status: "completed",
        completedAt: new Date(),
        completedBy: userId,
        actionRequest: { type: "NONE", status: "IDLE" },
        review: reviewId
    }, { new: true });

    // Sync campaign status
    if (updatedCollab.campaign) {
        const campaign = await Campaign.findById(updatedCollab.campaign);
        if (campaign) {
            campaign.status = "completed";
            await campaign.save();
        }
    }

    // Update influencer average rating
    if (reviewId) {
        const influencerProfile = await Influencer.findOne({ user: collaboration.influencer._id });
        if (influencerProfile) {
            const allReviews = await Review.find({ reviewee: collaboration.influencer._id, role: "brand" });
            const avg = allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;
            influencerProfile.averageRating = parseFloat(avg.toFixed(1));
            influencerProfile.reviewsCount = allReviews.length;
            await influencerProfile.save();
        }
    }

    await emitActivity({
        user: collaboration.influencer._id,
        role: "influencer",
        type: "collaboration_completed",
        title: "Collaboration Completed",
        description: `The brand has marked the collaboration as completed. Thank you for your work!`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    return collaboration;
};

/**
 * Add a deliverable (Brand only)
 */
const addDeliverable = async (collaborationId, userId, deliverableData) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only brands can add deliverables");
    }

    // Budget Validation
    const totalAllocated = collaboration.deliverables.reduce((sum, d) => sum + (d.allocatedBudget || 0), 0);
    const newBudget = deliverableData.allocatedBudget || 0;
    if (totalAllocated + newBudget > collaboration.agreedBudget) {
        throw new ApiError(validationStatus.badRequest, `Cannot exceed total collaboration budget of $${collaboration.agreedBudget}. Currently allocated: $${totalAllocated}. Remaining: $${collaboration.agreedBudget - totalAllocated}`);
    }

    collaboration.deliverables.push(deliverableData);
    await collaboration.save();
    return collaboration;
};

/**
 * Update a deliverable
 * - Brands can update any field
 * - Influencers can only move status to IN_PROGRESS (board drag)
 */
const updateDeliverable = async (collaborationId, deliverableId, userId, updateData) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    const isBrand = collaboration.brand.toString() === userId.toString();
    const isInfluencer = collaboration.influencer.toString() === userId.toString();

    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "You are not part of this collaboration");
    }

    // Influencer can only move status to IN_PROGRESS via the board
    if (isInfluencer) {
        const allowedStatuses = ["IN_PROGRESS"];
        if (!updateData.status || !allowedStatuses.includes(updateData.status)) {
            throw new ApiError(validationStatus.forbidden, "Influencers can only move tasks to In Progress");
        }
        // Strip all other fields for safety
        updateData = { status: updateData.status };
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    // SECURITY: Filter updateData to prevent unauthorized field modification
    const allowedFields = isBrand
        ? ["title", "description", "platform", "dueDate", "priority", "allocatedBudget", "isFinal"]
        : ["status", "description", "platform"]; // Influencer can only update basic info and status (e.g., to IN_PROGRESS)

    const filteredUpdateData = {};
    allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
            filteredUpdateData[field] = updateData[field];
        }
    });

    // Budget Validation (If brand is updating budget)
    if (isBrand && filteredUpdateData.allocatedBudget !== undefined) {
        const otherTasksBudget = collaboration.deliverables
            .filter(d => d._id.toString() !== deliverableId.toString())
            .reduce((sum, d) => sum + (d.allocatedBudget || 0), 0);

        if (otherTasksBudget + filteredUpdateData.allocatedBudget > collaboration.agreedBudget) {
            throw new ApiError(validationStatus.badRequest, `Budget overrun! Max available: $${collaboration.agreedBudget - otherTasksBudget}`);
        }
    }

    Object.assign(deliverable, filteredUpdateData);
    await collaboration.save();

    // Notify the other party
    const targetUserId = isBrand ? collaboration.influencer : collaboration.brand;
    await emitActivity({
        user: targetUserId,
        role: isBrand ? "influencer" : "brand",
        type: "deliverable_updated",
        title: "Deliverable Updated",
        description: `A deliverable in "${collaboration.title || 'your project'}" has been updated.`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    return collaboration;
};

/**
 * Submit a deliverable (Influencer only)
 */
const submitDeliverable = async (collaborationId, deliverableId, userId, submissionData) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.influencer.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only influencers can submit deliverables");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    deliverable.submissionFiles = submissionData.submissionFiles || [];
    deliverable.status = "SUBMITTED";
    deliverable.submittedAt = new Date();

    await collaboration.save();

    await emitActivity({
        user: collaboration.brand,
        role: "brand",
        type: "deliverable_submitted",
        title: "Deliverable Submitted",
        description: `The influencer has submitted a deliverable for "${collaboration.title || 'your project'}".`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    return collaboration;
};

/**
 * Review a deliverable (Brand only)
 */
const reviewDeliverable = async (collaborationId, deliverableId, userId, { status, revisionNotes, isFinal }) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only brands can review deliverables");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    if (!["APPROVED", "REVISION_REQUESTED"].includes(status)) {
        throw new ApiError(validationStatus.badRequest, "Invalid review status");
    }

    if (status === "APPROVED") {
        deliverable.status = status;
        deliverable.approvedAt = new Date();
        if (isFinal !== undefined) deliverable.isFinal = isFinal;

        // Save the collaboration so the database reflects the APPROVED status 
        // before stripeService fetches it.
        await collaboration.save();

        // --- STRIPE PAYOUT TRIGGER ---
        // If escrow was funded and it's unpaid, we can transfer
        if (collaboration.escrowFunded && deliverable.paymentStatus === "unpaid") {
            try {
                // Call Stripe Service to transfer funds
                await stripeService.transferDeliverablePayout(collaborationId, deliverableId);
                // Note: transferDeliverablePayout saves the collaboration inside its transaction!
                // We should return the updated collaboration directly by re-fetching it
                const updatedCollab = await Collaboration.findById(collaborationId);

                await emitActivity({
                    user: updatedCollab.influencer,
                    role: 'influencer',
                    type: 'deliverable_approved_paid',
                    title: 'Deliverable Approved & Paid',
                    description: `Your deliverable "${deliverable.title}" was approved and payout has been transferred!`,
                    relatedId: updatedCollab._id,
                    category: 'collaboration'
                });

                return updatedCollab;
            } catch (payoutError) {
                console.error("Payout failed during deliverable approval:", payoutError);
                throw new ApiError(500, "Deliverable approved but payout failed: " + payoutError.message);
            }
        }
    }

    await collaboration.save();

    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: status === "APPROVED" ? "deliverable_approved" : "deliverable_revision_requested",
        title: status === "APPROVED" ? "Deliverable Approved" : "Revision Requested",
        description: status === "APPROVED"
            ? `Your deliverable for "${collaboration.title || 'your project'}" was approved!`
            : `The brand requested a revision for a deliverable in "${collaboration.title || 'your project'}".`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    return collaboration;
};

/**
 * Delete a deliverable (Brand only)
 */
const deleteDeliverable = async (collaborationId, deliverableId, userId) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only brands can delete deliverables");
    }

    collaboration.deliverables.pull(deliverableId);
    await collaboration.save();
    return collaboration;
};

/**
 * Find the latest active collaboration between two users
 */
const getLatestCollaborationWithUser = async (userId, otherUserId) => {
    const collaboration = await Collaboration.findOne({
        isDeleted: false,
        $or: [
            { brand: userId, influencer: otherUserId },
            { brand: otherUserId, influencer: userId }
        ],
        status: { $in: ["active", "in_progress", "review"] }
    })
        .sort({ createdAt: -1 })
        .populate("brand", "fullname email profilePic")
        .populate("influencer", "fullname username email profilePic")
        .populate("campaign", "name description image platform endDate")
        .lean();

    if (!collaboration) return null;

    // Fetch influencer profile for stats
    const Influencer = mongoose.model("Influencer");
    const influencerProfile = await Influencer.findOne({ user: collaboration.influencer._id }).select("followersCount platforms");

    if (influencerProfile) {
        const mainPlatform = influencerProfile.platforms?.[0];
        collaboration.influencerStats = {
            followersCount: influencerProfile.followersCount || 0,
            engagementRate: mainPlatform?.influenceRate ? (mainPlatform.influenceRate * 1.2).toFixed(1) + "%" : "4.5%"
        };
    }

    return collaboration;
};

/**
 * Submit an influencer's review of a brand (post-completion)
 * Mirrors the brand review flow in completeCollaboration
 */
const submitInfluencerReview = async (collaborationId, userId, reviewData) => {
    const collaboration = await Collaboration.findById(collaborationId).populate("brand influencer");
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // Only the influencer can submit this review
    const isInfluencer = collaboration.influencer._id.toString() === userId.toString();
    if (!isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "Only influencers can review brands");
    }

    // Only on completed collaborations
    if (collaboration.status !== "completed") {
        throw new ApiError(validationStatus.badRequest, "Can only review after collaboration is completed");
    }

    // Prevent duplicate reviews
    if (collaboration.influencerReview) {
        throw new ApiError(validationStatus.badRequest, "You have already reviewed this brand");
    }

    // Secondary check for duplicate review to avoid race conditions
    const existingReview = await Review.findOne({ collaboration: collaborationId, role: "influencer" });
    if (existingReview) {
        throw new ApiError(validationStatus.badRequest, "You have already reviewed this brand");
    }

    if (!reviewData || !reviewData.rating) {
        throw new ApiError(validationStatus.badRequest, "Rating is required");
    }

    // Create the review (mirrors brand review creation in completeCollaboration)
    const review = await Review.create({
        reviewer: userId,                       // the influencer
        reviewee: collaboration.brand._id,      // the brand
        collaboration: collaboration._id,
        rating: reviewData.rating,
        comment: reviewData.comment || "",
        role: "influencer"                       // reviewer's role
    });

    // Link review to collaboration
    collaboration.influencerReview = review._id;
    await collaboration.save();

    // Recalculate Brand rating & reviewsCount (mirrors influencer rating recalc)
    const brandProfile = await Brand.findOne({ user: collaboration.brand._id });
    if (brandProfile) {
        const allBrandReviews = await Review.find({ reviewee: collaboration.brand._id, role: "influencer" });
        const avg = allBrandReviews.reduce((acc, r) => acc + r.rating, 0) / allBrandReviews.length;
        brandProfile.rating = parseFloat(avg.toFixed(1));
        brandProfile.reviewsCount = allBrandReviews.length;
        await brandProfile.save();
    }

    // Notify the brand
    await emitActivity({
        user: collaboration.brand._id,
        role: "brand",
        type: "influencer_review_received",
        title: "New Review Received",
        description: `An influencer has left a ${reviewData.rating}-star review on your collaboration.`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    // Return updated collaboration with populated review
    return await Collaboration.findById(collaborationId)
        .populate("brand", "fullname email profilePic")
        .populate("influencer", "fullname username email profilePic")
        .populate("campaign", "name description image platform endDate")
        .populate({ path: "review", model: "Review" })
        .populate({ path: "influencerReview", model: "Review" })
        .lean();
};

export const collaborationService = {
    sendRequest,
    getRequests,
    acceptRequest,
    updateRequestStatus,
    counterOffer,
    getCollaborations,
    getCollaborationDetails,
    getLatestCollaborationWithUser,
    updateCollaborationStatus,
    addDeliverable,
    updateDeliverable,
    submitDeliverable,
    reviewDeliverable,
    deleteDeliverable,
    submitActionRequest,
    handleActionRequest,
    completeCollaboration,
    submitInfluencerReview,
};
