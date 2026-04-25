import CollaborationRequest from "./collaboration-request.model.js";
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

/**
 * Send a collaboration request
 */
const sendRequest = async (senderId, { receiverId, campaignId, proposedBudget, note, deliveryDays, initiatedBy }) => {
    // Check if campaign exists and belongs to sender (if brand)
    if (initiatedBy === "brand") {
        const campaign = await Campaign.findOne({ _id: campaignId, brand: senderId, isDeleted: false });
        if (!campaign) throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    // Safety: If receiverId is an Influencer/Brand ID instead of User ID, resolve it
    let targetReceiverId = receiverId;
    const userCheck = await User.findById(receiverId).select("_id");
    if (!userCheck) {
        // Check if it's an Influencer ID
        const Influencer = mongoose.model("Influencer");
        const inf = await Influencer.findById(receiverId).select("user");
        if (inf) {
            targetReceiverId = inf.user;
        } else {
            // Check if it's a Brand ID
            const Brand = mongoose.model("Brand");
            const brand = await Brand.findById(receiverId).select("user");
            if (brand) targetReceiverId = brand.user;
        }
    }

    // Check for existing pending or accepted request for this campaign between these two users
    const existingRequest = await CollaborationRequest.findOne({
        $or: [
            { sender: senderId, receiver: targetReceiverId },
            { sender: targetReceiverId, receiver: senderId }
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
        receiver: targetReceiverId,
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
const getRequests = async (userId, { status, type, platform, page = 1, limit = 10, search }) => {
    const skip = (page - 1) * limit;
    
    // Base match based on type
    let matchStage = {};
    const objectUserId = new mongoose.Types.ObjectId(userId.toString());
    
    // Support both User ID and Role (Influencer/Brand) IDs for maximum visibility
    const influencer = await Influencer.findOne({ user: objectUserId }).select("_id");
    const brand = await Brand.findOne({ user: objectUserId }).select("_id");
    const allIdentities = Array.from(new Set([
        objectUserId,
        ...(influencer ? [influencer._id] : []),
        ...(brand ? [brand._id] : [])
    ]));

    if (type === "sent") {
        matchStage.sender = { $in: allIdentities };
    } else if (type === "received") {
        matchStage.receiver = { $in: allIdentities };
    } else {
        matchStage.$or = [
            { sender: { $in: allIdentities } },
            { receiver: { $in: allIdentities } }
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
        // Filter out requests for deleted campaigns, but allow null if lookup failed (shouldn't happen but safe)
        { $match: { "campaignDetails.isDeleted": { $ne: true } } },
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
        // Search filter (Post-Lookup)
        ...(search ? [
            {
                $match: {
                    $or: [
                        { "campaignDetails.name": { $regex: search, $options: "i" } },
                        { "senderDetails.fullname": { $regex: search, $options: "i" } },
                        { "receiverDetails.fullname": { $regex: search, $options: "i" } },
                        { "influencerDetails.username": { $regex: search, $options: "i" } }
                    ]
                }
            }
        ] : []),
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
    // Separate counts for tabs (Sent vs Received) - Must respect campaign deletion
    const sentCountResult = await CollaborationRequest.aggregate([
        { $match: { sender: { $in: allIdentities } } },
        { $lookup: { from: "campaigns", localField: "campaign", foreignField: "_id", as: "campaignInfo" } },
        { $unwind: { path: "$campaignInfo", preserveNullAndEmptyArrays: true } },
        { $match: { "campaignInfo.isDeleted": { $ne: true } } },
        { $count: "count" }
    ]);
    const receivedCountResult = await CollaborationRequest.aggregate([
        { $match: { receiver: { $in: allIdentities } } },
        { $lookup: { from: "campaigns", localField: "campaign", foreignField: "_id", as: "campaignInfo" } },
        { $unwind: { path: "$campaignInfo", preserveNullAndEmptyArrays: true } },
        { $match: { "campaignInfo.isDeleted": { $ne: true } } },
        { $count: "count" }
    ]);

    const sentCount = sentCountResult[0]?.count || 0;
    const receivedCount = receivedCountResult[0]?.count || 0;

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
 * Accept collaboration request - and automatically reject others for the same campaign
 */
const acceptRequest = async (requestId, userId) => {
    const request = await CollaborationRequest.findById(requestId);
    if (!request || request.receiver.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.notFound, "Request not found or access denied");
    }
    if (request.status !== "pending") throw new ApiError(validationStatus.badRequest, `Request is already ${request.status}`);

    const campaignId = request.campaign;
    const campaign = await Campaign.findById(campaignId);

    // 1. Accept this request
    request.status = "accepted";
    request.respondedAt = new Date();
    await request.save();

    // 2. Reject ALL other pending requests for this campaign
    const otherRequests = await CollaborationRequest.find({
        campaign: campaignId,
        _id: { $ne: requestId },
        status: "pending"
    });

    if (otherRequests.length > 0) {
        await CollaborationRequest.updateMany(
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

    // 3. Create Collaboration
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

    // 4. Emit activities for the newly started collaboration
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

    const receiverUser = await User.findById(request.receiver).select('role');
    await emitActivity({
        user: request.receiver,
        role: receiverUser?.role || (request.initiatedBy === 'brand' ? 'influencer' : 'brand'),
        type: 'collaboration_started',
        title: 'Collaboration Started',
        description: `You accepted the request for "${campaign?.name || 'a campaign'}".`,
        relatedId: collaboration._id,
        category: 'collaboration'
    });

    // Create or link conversation
    await messageService.createConversation(
        request.sender, 
        request.receiver, 
        request.campaign, 
        collaboration._id
    );
    
    // 5. Update campaign status to perfectly sync with the new collaboration's status ('active')
    if (campaign && campaign.status !== 'active') {
        campaign.status = 'active';
        await campaign.save();
    }

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
        // Project final structure
        {
            $project: {
                _id: 1,
                title: 1,
                status: 1,
                agreedBudget: 1,
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
                            priority: "$$d.priority"
                        }
                    }
                },
                startDate: 1,
                endDate: 1,
                paymentStatus: 1,
                review: "$reviewDetails"
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

    // Completion request requires all deliverables to be APPROVED/DELIVERED
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
    const updateData = {
        "actionRequest.status": "APPROVED"
    };

    if (type === "CANCEL") {
        updateData.status = "cancelled";
        updateData.cancellationReason = reason;
        updateData.cancelledBy = requestedBy;
    } else if (type === "COMPLETE") {
        updateData.status = "completed";
        updateData.completedAt = new Date();
        updateData.completedBy = requestedBy;
        
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
            updateData.review = review._id;
            
            // Update influencer average rating
            const influencerProfile = await Influencer.findOne({ user: requestedBy });
            if (influencerProfile) {
                const allReviews = await Review.find({ reviewee: requestedBy, role: "brand" });
                const avg = allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;
                influencerProfile.averageRating = parseFloat(avg.toFixed(1));
                await influencerProfile.save();
            }
        }
    } else if (type === "RESUME") {
        updateData.status = "active";
    }

    const updatedCollab = await Collaboration.findByIdAndUpdate(id, updateData, { new: true })
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

    Object.assign(deliverable, updateData);
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
const reviewDeliverable = async (collaborationId, deliverableId, userId, { status, revisionNotes }) => {
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

    deliverable.status = status;
    if (revisionNotes) deliverable.revisionNotes = revisionNotes;
    if (status === "APPROVED") deliverable.approvedAt = new Date();

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

export const collaborationService = {
    sendRequest,
    getRequests,
    acceptRequest,
    updateRequestStatus,
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
};
