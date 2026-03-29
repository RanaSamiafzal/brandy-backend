import { collaborationService } from "./collaboration.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { emitActivity } from "../../utils/activityUtils.js";

/**
 * Handle sending a collaboration request
 */
const sendCollaborationRequest = AsyncHandler(async (req, res) => {
    const senderId = req.user._id;
    const request = await collaborationService.sendRequest(senderId, {
        ...req.body,
        initiatedBy: req.user.role,
    });

    // Log activity
    await emitActivity({
        user: senderId,
        role: req.user.role,
        type: "collaboration_request_sent",
        title: "Collaboration Request Sent",
        description: `Collaboration request sent successfully.`,
        relatedId: request._id,
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, request, "Collaboration request sent successfully")
    );
});

/**
 * Handle fetching collaboration requests
 */
const getCollaborationRequests = AsyncHandler(async (req, res) => {
    const result = await collaborationService.getRequests(req.user._id, req.query);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Collaboration requests fetched successfully")
    );
});

/**
 * Handle accepting a collaboration request
 */
const acceptCollaborationRequest = AsyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const { request, collaboration } = await collaborationService.acceptRequest(requestId, req.user._id);

    // Log activity for both parties
    await emitActivity({
        user: request.sender,
        role: request.initiatedBy === "brand" ? "brand" : "influencer",
        type: "collaboration_accepted",
        title: "Collaboration Request Accepted",
        description: `Your collaboration request has been accepted.`,
        relatedId: collaboration._id,
    });

    await emitActivity({
        user: req.user._id,
        role: req.user.role,
        type: "collaboration_started",
        title: "Collaboration Started",
        description: `You accepted a collaboration request.`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { request, collaboration }, "Collaboration request accepted")
    );
});

/**
 * Handle rejecting a collaboration request
 */
const rejectCollaborationRequest = AsyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const request = await collaborationService.updateRequestStatus(requestId, req.user._id, "rejected");
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, request, "Collaboration request rejected")
    );
});

/**
 * Handle cancelling a collaboration request
 */
const cancelCollaborationRequest = AsyncHandler(async (req, res) => {
    const { requestId } = req.params;
    const request = await collaborationService.updateRequestStatus(requestId, req.user._id, "cancelled");
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, request, "Collaboration request cancelled")
    );
});

export const collaborationController = {
    sendCollaborationRequest,
    getCollaborationRequests,
    acceptCollaborationRequest,
    rejectCollaborationRequest,
    cancelCollaborationRequest,
};
