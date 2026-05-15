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

    const collabData = { collaborationId: collaboration._id, status: collaboration.status };
    socketManager.emitToRoom(collaboration._id.toString(), "collaboration_updated", collabData);

    return collaboration;
};

/**
 * Submit an action request (CANCEL, COMPLETE, RESUME)
 */
const submitActionRequest = async (id, userId, { type, reason, proposedTasks = [] }) => {
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
        requestedAt: new Date(),
        proposedTasks: proposedTasks || []
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

    const initialTotalPaid = collaboration.totalPaidAmount || 0;

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

        // --- CANCELLATION RULE (12 HOURS) ---
        // If deliverable.status === 'IN_PROGRESS' AND inProgressAt >= 12 hours 
        // OR deliverable.status === 'SUBMITTED'
        // Then brand MUST pay 50% for that task upon cancellation
        const now = new Date();
        const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);

        for (const deliverable of collaboration.deliverables) {
            const isOldInProgress = deliverable.status === "IN_PROGRESS" && deliverable.inProgressAt <= twelveHoursAgo;
            const isSubmitted = deliverable.status === "SUBMITTED";

            if (isOldInProgress || isSubmitted) {
                console.log(`💰 Cancellation payout (50%) triggered for deliverable: ${deliverable._id} (${deliverable.status})`);
                // Mark as approved to satisfy transfer service requirement
                deliverable.status = "APPROVED";
                deliverable.approvedAt = now;

                // --- 50% DEDUCTION RULE ---
                const originalBudget = deliverable.allocatedBudget || 0;
                deliverable.allocatedBudget = Math.round((originalBudget * 0.5) * 100) / 100;

                console.log(`Updated budget for ${deliverable._id}: $${deliverable.allocatedBudget} (50% of $${originalBudget})`);
            } else if (deliverable.status === "IN_PROGRESS") {
                // Task started less than 12 hours ago -> Cancel without pay
                deliverable.status = "PENDING"; // Reset or leave as in progress but cancelled? 
                // Since project is cancelled, status doesn't matter much but let's avoid 'in progress'
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
    } else if (type === "ADD_TASKS") {
        // --- ADD_TASKS LOGIC ---
        // 1. Calculate new tasks budget
        const proposedTasks = collaboration.actionRequest.proposedTasks || [];
        const additionalBudget = proposedTasks.reduce((sum, t) => sum + (t.allocatedBudget || 0), 0);

        // 2. Add tasks to deliverables
        proposedTasks.forEach(task => {
            // Convert to plain object if it's a Mongoose sub-document
            const taskObj = typeof task.toObject === 'function' ? task.toObject() : task;
            
            // Ensure status is PENDING and required fields are present
            collaboration.deliverables.push({
                title: taskObj.title || "Additional Deliverable",
                platform: taskObj.platform || "instagram",
                description: taskObj.description || "",
                dueDate: taskObj.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                allocatedBudget: taskObj.allocatedBudget || 0,
                status: "PENDING",
                paymentStatus: "unpaid",
                isAdditional: true
            });
        });

        // 3. Update agreed budget
        const oldBudget = collaboration.agreedBudget || 0;
        collaboration.agreedBudget = Math.round((oldBudget + additionalBudget) * 100) / 100;

        // 4. Set status to 'awaiting_funds' if budget increased (so brand can pay the difference)
        if (additionalBudget > 0) {
            collaboration.escrowFunded = false; // Mark as not fully funded
            collaboration.status = "awaiting_funds";
            
            // Clear old PaymentIntent ID if it's no longer valid (different amount or status)
            if (collaboration.stripePaymentIntentId) {
                collaboration.stripePaymentIntentId = null;
            }
        }

        // 5. Reset actionRequest after successful processing
        collaboration.actionRequest = {
            type: "NONE",
            status: "IDLE",
            proposedTasks: []
        };

        console.log(`✅ Approved ADD_TASKS: Added ${proposedTasks.length} tasks. Budget increased from $${oldBudget} to $${collaboration.agreedBudget}. Status set to: ${collaboration.status}`);
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

        // --- AUTOMATIC REFUND ---
        // After paying out the influencers, refund anything left in escrow to the brand
        let refundData = { refundedAmount: 0 };
        try {
            refundData = await stripeService.refundCollaborationBalance(updatedCollab._id);
        } catch (err) {
            console.error(`Failed to refund brand for collaboration ${updatedCollab._id}:`, err.message);
        }

        // Add cancellation summary to the returned object
        const currentTotalPaid = (await Collaboration.findById(updatedCollab._id)).totalPaidAmount || 0;
        const compensationPaid = currentTotalPaid - initialTotalPaid;
        
        return {
            ...updatedCollab.toObject(),
            cancellationSummary: {
                compensationPaid: Math.round(compensationPaid * 100) / 100,
                refundedAmount: refundData.refundedAmount || 0,
                totalRefunded: refundData.refundedAmount || 0,
                reason: updatedCollab.cancellationReason
            }
        };
    }

    // Sync campaign status
    if (updatedCollab.campaign) {
        const campaign = await Campaign.findById(updatedCollab.campaign._id || updatedCollab.campaign);
        if (campaign) {
            if (type === "COMPLETE") campaign.status = "completed";
            else if (type === "CANCEL") campaign.status = "cancelled";
            await campaign.save();
        }
    }

    const collabData = { collaborationId: updatedCollab._id, status: updatedCollab.status };
    socketManager.emitToRoom(updatedCollab._id.toString(), "collaboration_updated", collabData);
    
    // Also emit directly to both users to ensure their list views refresh
    socketManager.emitToUser(updatedCollab.brand._id || updatedCollab.brand, "collaboration_updated", collabData);
    socketManager.emitToUser(updatedCollab.influencer._id || updatedCollab.influencer, "collaboration_updated", collabData);

    return updatedCollab;
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

    // Note: No auto-refund here anymore. Full budget is released to influencer via isFinal task.

    await emitActivity({
        user: collaboration.influencer._id,
        role: "influencer",
        type: "collaboration_completed",
        title: "Collaboration Completed",
        description: `The brand has marked the collaboration as completed. Thank you for your work!`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    const collabData = { collaborationId: updatedCollab._id, status: updatedCollab.status };
    socketManager.emitToRoom(updatedCollab._id.toString(), "collaboration_updated", collabData);

    return updatedCollab;
};

/**
 * Confirm agreement/contract signature
 */
const confirmAgreement = async (id, userId) => {
    const collaboration = await Collaboration.findById(id).populate("brand influencer");
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    const isBrand = collaboration.brand._id.toString() === userId.toString();
    const isInfluencer = collaboration.influencer._id.toString() === userId.toString();

    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "Access denied");
    }

    if (isBrand) {
        collaboration.brandAgreed = true;
    } else {
        collaboration.influencerAgreed = true;
    }

    // If both have agreed, we can set agreedAt
    if (collaboration.brandAgreed && collaboration.influencerAgreed) {
        collaboration.agreedAt = new Date();
        // If status was 'accepted', move to 'awaiting_funds'
        if (collaboration.status === "requested" || collaboration.status === "accepted") {
            collaboration.status = "awaiting_funds";
        }
    }

    await collaboration.save();

    // Notify the other party
    const targetUserId = isBrand ? collaboration.influencer : collaboration.brand;
    const targetUser = await User.findById(targetUserId).select('role');

    await emitActivity({
        user: targetUserId,
        role: targetUser?.role || 'user',
        type: 'agreement_signed',
        title: 'Agreement Signed',
        description: `The ${isBrand ? 'brand' : 'influencer'} has signed the collaboration agreement.`,
        relatedId: collaboration._id,
        category: 'collaboration'
    });

    const collabData = { collaborationId: collaboration._id, status: collaboration.status };
    socketManager.emitToRoom(collaboration._id.toString(), "collaboration_updated", collabData);

    return collaboration;
};

export const actionService = {
  updateCollaborationStatus,
  submitActionRequest,
  handleActionRequest,
  completeCollaboration,
  confirmAgreement
};
