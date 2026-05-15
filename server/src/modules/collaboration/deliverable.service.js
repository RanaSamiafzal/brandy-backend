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
 * Add a deliverable (Brand only)
 */
const addDeliverable = async (collaborationId, userId, deliverableData) => {
    const collaboration = await Collaboration.findById(collaborationId);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only brands can add deliverables");
    }

    if (!collaboration.brandAgreed || !collaboration.influencerAgreed) {
        throw new ApiError(validationStatus.badRequest, "Agreement must be signed by both parties before adding deliverables");
    }

    // Escrow Check
    if (!collaboration.escrowFunded) {
        throw new ApiError(validationStatus.badRequest, "Escrow must be funded before adding deliverables");
    }

    // Budget Validation
    const totalAllocated = collaboration.deliverables.reduce((sum, d) => sum + (d.allocatedBudget || 0), 0);
    const newBudget = deliverableData.allocatedBudget || 0;
    if (totalAllocated + newBudget > collaboration.agreedBudget) {
        throw new ApiError(validationStatus.badRequest, `Cannot exceed total collaboration budget of $${collaboration.agreedBudget}. Currently allocated: $${totalAllocated}. Remaining: $${collaboration.agreedBudget - totalAllocated}`);
    }

    collaboration.deliverables.push(deliverableData);

    // Recalculate total allocated with precision
    const updatedAllocated = collaboration.deliverables.reduce((sum, d) => sum + (d.allocatedBudget || 0), 0);
    console.log(`[Deliverable] Added task. Total allocated: $${updatedAllocated} / $${collaboration.agreedBudget}`);

    await collaboration.save();

    // Notify the influencer
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "deliverable_updated", // Reusing type or using a generic one
        title: "New Deliverable Added",
        description: `A new deliverable has been added to "${collaboration.title || 'your project'}".`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    const delivData = { collaborationId: collaboration._id, deliverableId: deliverableData._id, status: deliverableData.status };
    socketManager.emitToRoom(collaboration._id.toString(), "deliverable_updated", delivData);

    // Also emit collaboration_updated to refresh budget summary on frontend
    socketManager.emitToRoom(collaboration._id.toString(), "collaboration_updated", {
        collaborationId: collaboration._id,
        agreedBudget: collaboration.agreedBudget,
        totalPaidAmount: collaboration.totalPaidAmount
    });

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

    const delivData = { collaborationId: collaboration._id, deliverableId, status: deliverable.status };
    socketManager.emitToRoom(collaboration._id.toString(), "deliverable_updated", delivData);

    // Also emit collaboration_updated to refresh budget summary on frontend
    socketManager.emitToRoom(collaboration._id.toString(), "collaboration_updated", {
        collaborationId: collaboration._id,
        agreedBudget: collaboration.agreedBudget,
        totalPaidAmount: collaboration.totalPaidAmount
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

    if (!collaboration.brandAgreed || !collaboration.influencerAgreed) {
        throw new ApiError(validationStatus.badRequest, "Agreement must be signed by both parties before work can begin");
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

    const deliverableData = { collaborationId: collaboration._id, deliverableId, status: deliverable.status };
    socketManager.emitToRoom(collaboration._id.toString(), "deliverable_updated", deliverableData);

    // Also notify users directly for list view refresh
    socketManager.emitToUser(collaboration.brand, "collaboration_updated", { collaborationId: collaboration._id });
    socketManager.emitToUser(collaboration.influencer, "collaboration_updated", { collaborationId: collaboration._id });

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

    if (!collaboration.brandAgreed || !collaboration.influencerAgreed) {
        throw new ApiError(validationStatus.badRequest, "Agreement must be signed by both parties");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    if (!["APPROVED", "REVISION_REQUESTED"].includes(status)) {
        throw new ApiError(validationStatus.badRequest, "Invalid review status");
    }

    // 1. Update in-memory document
    deliverable.status = status;
    if (status === "APPROVED") {
        deliverable.approvedAt = new Date();
        deliverable.revisionNotes = "";
        if (isFinal !== undefined) deliverable.isFinal = isFinal;
    } else {
        deliverable.revisionNotes = revisionNotes || "Please review the requirements.";
    }

    // 2. Save once
    await collaboration.save();

    // 3. Handle Payout if approved
    if (status === "APPROVED" && collaboration.escrowFunded && deliverable.paymentStatus === "unpaid") {
        try {
            await stripeService.transferDeliverablePayout(collaborationId, deliverableId);

            // Re-fetch to get updated payment status and transfer ID
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
            // We don't throw here to avoid rolling back the "APPROVED" status in DB, 
            // but we should inform the user that payout failed.
            // Actually, throwing is better for visibility, but the status is already saved.
            throw new ApiError(500, "Deliverable approved but payout failed: " + payoutError.message);
        }
    }

    // 4. Activity for normal approval or revision
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

    const delivData = { collaborationId: collaboration._id, deliverableId, status };
    socketManager.emitToRoom(collaboration._id.toString(), "deliverable_updated", delivData);

    // Also notify users directly for list view refresh
    socketManager.emitToUser(collaboration.brand, "collaboration_updated", { collaborationId: collaboration._id });
    socketManager.emitToUser(collaboration.influencer, "collaboration_updated", { collaborationId: collaboration._id });

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

    // Notify the influencer
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "deliverable_updated",
        title: "Deliverable Removed",
        description: `A deliverable was removed from "${collaboration.title || 'your project'}".`,
        relatedId: collaboration._id,
        category: "collaboration"
    });

    const delivData = { collaborationId: collaboration._id, deliverableId, status: "DELETED" };
    socketManager.emitToRoom(collaboration._id.toString(), "deliverable_updated", delivData);

    // Also emit collaboration_updated to refresh budget summary on frontend
    socketManager.emitToRoom(collaboration._id.toString(), "collaboration_updated", {
        collaborationId: collaboration._id,
        agreedBudget: collaboration.agreedBudget,
        totalPaidAmount: collaboration.totalPaidAmount
    });

    return collaboration;
};

export const deliverableService = {
    addDeliverable,
    updateDeliverable,
    submitDeliverable,
    reviewDeliverable,
    deleteDeliverable
};
