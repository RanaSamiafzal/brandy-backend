import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import CollaborationRequest from "../models/collaborationRequestModel.js";
import Collaboration from "../models/collaborationModel.js";
import { emitActivity } from "../utils/activityUtils.js";
import mongoose from "mongoose";
import Brand from "../models/brandModel.js";
import Campaign from "../models/campaignModel.js";
import Influencer from "../models/influencerModel.js";

// collaboration req
const sendCollaborationRequest = AsyncHandler(async (req, res) => {

    const userId = req.user._id

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, 'Unauthorized request')
    }

    if (req.user.role !== "brand") {
        throw new ApiError(validationStatus.forbidden, "Access denied")
    }

    const { influencerId, campaignId, note, proposedBudget } = req.body;

    if (
        !mongoose.Types.ObjectId.isValid(influencerId) ||
        !mongoose.Types.ObjectId.isValid(campaignId)
    ) {
        throw new ApiError(validationStatus.badRequest, "Invalid IDs provided");
    }

    // find brand
    // [MODIFIED to use aggregation pipeline as requested]
    const brands = await Brand.aggregate([
        { $match: { user: userId } },
        { $limit: 1 }
    ]);
    const brand = brands[0];
    if (!brand) {
        throw new ApiError(validationStatus.notFound, "Brand profile not found");
    }

    // find campaign with ownership protection
    // [MODIFIED to use aggregation pipeline as requested]
    const campaigns = await Campaign.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(campaignId),
                brand: brand._id,
                isDeleted: false,
            }
        },
        { $limit: 1 }
    ]);
    const campaign = campaigns[0];

    if (!campaign) {
        throw new ApiError(validationStatus.notFound, "Campaign not found or access denied");
    }

    // find influencer
    // [MODIFIED to use aggregation pipeline as requested]
    const influencers = await Influencer.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(influencerId) } },
        { $limit: 1 }
    ]);
    const influencer = influencers[0];

    if (!influencer) {
        throw new ApiError(validationStatus.notFound, "Influencer not found");
    }

    // check if collaboration request already exists for the same campaign and influencer to avoid duplicate requests
    const existingRequests = await CollaborationRequest.aggregate([
        {
            $match: {
                sender: userId,
                receiver: influencer.user,
                campaign: new mongoose.Types.ObjectId(campaignId),
                status: { $in: ["pending", "accepted"] }, // check only pending and accepted requests to allow new request if previous was rejected
            }
        },
        { $limit: 1 }
    ]);
    const existingRequest = existingRequests[0];

    // used this technique if the request is already cancelled or rejected than allowed to send it again
    if (existingRequest) {

        if (existingRequest.status === "pending") {
            throw new ApiError(validationStatus.badRequest, "Request already pending");
        }

        if (existingRequest.status === "accepted") {
            throw new ApiError(validationStatus.badRequest, "Collaboration already accepted");
        }

        // If rejected or cancelled → reset request
        const requestInstance = await CollaborationRequest.findById(existingRequest._id);
        requestInstance.status = "pending";
        requestInstance.proposedBudget = proposedBudget || null;
        requestInstance.note = note || "";
        requestInstance.respondedAt = null;

        await requestInstance.save();

        return res.status(validationStatus.ok).json(
            new ApiResponse(validationStatus.ok, { request: requestInstance }, "Request re-sent successfully")
        );
    }

    // create collaboration request
    const collaborationRequest = await CollaborationRequest.create({
        initiatedBy: "brand",
        sender: userId,
        receiver: influencer.user,
        campaignRelated: campaignId,
        note: note?.trim() || "",
        proposedBudget: proposedBudget || 0,
        deliveryDays: "7" // Default if not provided, or extract from req.body
    });

    // log activity for sending collaboration request
    await emitActivity({
        user: userId,
        role: "brand",
        type: "collaboration_request_sent",
        title: "Collaboration Request Sent",
        description: `Collaboration request sent to ${influencer.username} for campaign "${campaign.title}"`,
        relatedId: collaborationRequest._id,
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, {
            collaborationRequest,
        },
            "Collaboration request sent successfully")
    );

});

const getCollaborationRequests = AsyncHandler(async (req, res) => {

    // validate user 
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(validationStatus.unauthorized, 'Unauthorized Access')
    }

    // get data from frontend user
    const { page = 1, limit = 10, status, search } = req.query;

    // pagination 
    const skip = (page - 1) * limit;

    // match the collaboration 
    const matchStage = {
        $or: [
            { sender: userId },
            { receiver: userId }
        ]
    };

    if (status) matchStage.status = status;

    const result = await CollaborationRequest.aggregate([

        { $match: matchStage },

        //join sender info
        {
            $lookup: {
                from: 'users',
                localField: 'sender',
                foreignField: '_id',
                as: "senderUser"
            }
        },
        { $unwind: '$senderUser' },

        //join receiver info
        {
            $lookup: {
                from: 'users',
                localField: 'receiver',
                foreignField: '_id',
                as: "receiverUser"
            }
        },
        { $unwind: '$receiverUser' },

        // join campaign info
        {
            $lookup: {
                from: 'campaigns',
                localField: 'campaign',
                foreignField: '_id',
                as: 'campaignData'
            }
        },
        { $unwind: '$campaignData' },

        { $sort: { createdAt: -1 } },

        {
            $facet: {
                data: [
                    { $skip: skip },
                    { $limit: Number(limit) },
                ],
                totalCount: [
                    { $count: "count" }
                ],
            }
        }
    ])

    const collaborationRequests = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            requests: collaborationRequests,
            total: totalCount,
            page: Number(page),
            pages: Math.ceil(totalCount / limit),
        },
            "Collaboration requests fetched successfully")
    );
});

const getRequestDetails = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid requestId");
    }

    const request = await CollaborationRequest.aggregate([
        {
            $match: {
                _id: new mongoose.Types.ObjectId(requestId),
                $or: [{ sender: userId }, { receiver: userId }]
            }
        },
        { $lookup: { from: "users", localField: "sender", foreignField: "_id", as: "sender" } },
        { $unwind: "$sender" },
        { $lookup: { from: "users", localField: "receiver", foreignField: "_id", as: "receiver" } },
        { $unwind: "$receiver" },
        { $lookup: { from: "campaigns", localField: "campaign", foreignField: "_id", as: "campaign" } },
        { $unwind: "$campaign" },
        { $project: { "sender.password": 0, "sender.refreshToken": 0, "receiver.password": 0, "receiver.refreshToken": 0 } }
    ]);

    if (!request.length) throw new ApiError(validationStatus.notFound, "Collaboration request not found");

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { request: request[0] }, "Collaboration request details fetched successfully")
    );
});

const acceptRequest = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        throw new ApiError(validationStatus.badRequest, "Invalid requestId");
    }

    // find the request and verify the receiver is the one accepting
    const request = await CollaborationRequest.findById(requestId);
    if (!request) throw new ApiError(validationStatus.notFound, "Request not found");

    if (request.receiver.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "You are not authorized to accept this request");
    }

    if (request.status !== "pending") {
        throw new ApiError(validationStatus.badRequest, `Request is already ${request.status}`);
    }

    // mark request as accepted
    request.status = "accepted";
    request.respondedAt = new Date();
    await request.save();

    // automatically create a Collaboration document from the accepted request
    // idempotent: if already created (e.g. retry), we skip creation
    const existingCollaboration = await Collaboration.findOne({ request: request._id });

    let collaboration = existingCollaboration;

    if (!existingCollaboration) {
        // Fetch campaign to get title and description
        const campaign = await Campaign.findById(request.campaignRelated);
        
        collaboration = await Collaboration.create({
            brand: request.sender,         // brand user who sent the request
            influencer: request.receiver,  // influencer user who accepted it
            campaign: request.campaignRelated,
            request: request._id,
            title: campaign?.title || "New Collaboration",
            description: campaign?.description || "",
            agreedBudget: request.proposedBudget || 0,
            status: "active",
        });
    }

    // log activity for the brand who sent the request
    await emitActivity({
        user: request.sender,
        role: "brand",
        type: "collaboration_accepted",
        title: "Collaboration Request Accepted",
        description: `Your collaboration request has been accepted. A collaboration has been created.`,
        relatedId: collaboration._id,
    });

    // log activity for the influencer who accepted
    await emitActivity({
        user: userId,
        role: "influencer",
        type: "collaboration_started",
        title: "Collaboration Started",
        description: `You accepted a collaboration request. Work can now begin.`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            request,
            collaboration,
        }, "Collaboration request accepted and collaboration created")
    );
});

const rejectRequest = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { requestId } = req.params;

    const request = await CollaborationRequest.findById(requestId);
    if (!request) throw new ApiError(validationStatus.notFound, "Request not found");

    if (request.receiver.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "You are not authorized to reject this request");
    }

    request.status = "rejected";
    request.respondedAt = new Date();
    await request.save();

    return res.status(validationStatus.ok).json(new ApiResponse(validationStatus.ok, request, "Collaboration request rejected"));
});

const cancelRequest = AsyncHandler(async (req, res) => {
    const userId = req.user?._id;
    const { requestId } = req.params;

    const request = await CollaborationRequest.findById(requestId);
    if (!request) throw new ApiError(validationStatus.notFound, "Request not found");

    if (request.sender.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "You are not authorized to cancel this request");
    }

    request.status = "cancelled";
    request.respondedAt = new Date();
    await request.save();

    return res.status(validationStatus.ok).json(new ApiResponse(validationStatus.ok, request, "Collaboration request cancelled"));
});

export {
    sendCollaborationRequest,
    getCollaborationRequests,
    getRequestDetails,
    acceptRequest,
    rejectRequest,
    cancelRequest
}
