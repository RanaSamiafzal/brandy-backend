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

/**
 * Handle fetching all collaborations for the user
 */
const getCollaborations = AsyncHandler(async (req, res) => {
    const result = await collaborationService.getCollaborations(req.user._id, req.query);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Collaborations fetched successfully")
    );
});

/**
 * Handle fetching a single collaboration's details
 */
const getCollaborationDetails = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.getCollaborationDetails(id, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration details fetched successfully")
    );
});

/**
 * Handle cancelling an active collaboration
 */
const cancelCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const collaboration = await collaborationService.updateCollaborationStatus(id, req.user._id, "cancelled", reason);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration cancelled successfully")
    );
});

/**
 * Handle pausing an active collaboration
 */
const pauseCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.updateCollaborationStatus(id, req.user._id, "paused");
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration paused successfully")
    );
});

/**
 * Handle resuming a paused collaboration (Direct Brand Action)
 */
const resumeCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.updateCollaborationStatus(id, req.user._id, "active");
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration resumed successfully")
    );
});

/**
 * Handle suspending a collaboration
 */
const suspendCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.updateCollaborationStatus(id, req.user._id, "suspended");
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration suspended successfully")
    );
});

/**
 * Submit an action request (CANCEL, COMPLETE, RESUME)
 */
const submitActionRequest = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.submitActionRequest(id, req.user._id, req.body);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Action request submitted successfully")
    );
});

/**
 * Handle/Approve an action request
 */
const handleActionRequest = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.handleActionRequest(id, req.user._id, req.body);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Action request processed successfully")
    );
});

/**
 * Handle completing an active collaboration (with review)
 */
const completeCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reviewData } = req.body;
    const collaboration = await collaborationService.completeCollaboration(id, req.user._id, reviewData);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration completed successfully")
    );
});

/**
 * Handle adding a deliverable
 */
const addDeliverable = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const collaboration = await collaborationService.addDeliverable(id, req.user._id, req.body);
    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, collaboration, "Deliverable added successfully")
    );
});

/**
 * Handle updating a deliverable's details
 */
const updateDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const collaboration = await collaborationService.updateDeliverable(id, deliverableId, req.user._id, req.body);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Deliverable updated successfully")
    );
});

/**
 * Handle influencer submission of a deliverable
 */
const submitDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const collaboration = await collaborationService.submitDeliverable(id, deliverableId, req.user._id, req.body);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Deliverable submitted successfully")
    );
});

/**
 * Handle brand review (approve/reject) of a deliverable
 */
const reviewDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const collaboration = await collaborationService.reviewDeliverable(id, deliverableId, req.user._id, req.body);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Deliverable reviewed successfully")
    );
});

/**
 * Handle deleting a deliverable
 */
const deleteDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const collaboration = await collaborationService.deleteDeliverable(id, deliverableId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Deliverable deleted successfully")
    );
});

/**
 * Handle fetching the latest active collaboration with a specific user
 */
const getLatestCollaborationWithUser = AsyncHandler(async (req, res) => {
    const { otherUserId } = req.params;
    const collaboration = await collaborationService.getLatestCollaborationWithUser(req.user._id, otherUserId);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Latest collaboration fetched successfully")
    );
});

export const collaborationController = {
    sendCollaborationRequest,
    getCollaborationRequests,
    acceptCollaborationRequest,
    rejectCollaborationRequest,
    cancelCollaborationRequest,
    getCollaborations,
    getCollaborationDetails,
    getLatestCollaborationWithUser,
    cancelCollaboration,
    completeCollaboration,
    pauseCollaboration,
    resumeCollaboration,
    suspendCollaboration,
    submitActionRequest,
    handleActionRequest,
    addDeliverable,
    updateDeliverable,
    submitDeliverable,
    reviewDeliverable,
    deleteDeliverable,
};
