import { AsyncHandler } from "../utils/Asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { validationStatus } from "../utils/ValidationStatusCode.js";
import Collaboration from "../models/collaborationModel.js";
import { emitActivity } from "../utils/activityUtils.js";
import mongoose from "mongoose";




// ─────────────────────────────────────────────────────────────
// GET /collaborations
// Returns all collaborations for the logged-in user (brand or influencer)
// ─────────────────────────────────────────────────────────────
const getCollaborations = AsyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // match collaborations where user is either brand or influencer
    const matchStage = {
        isDeleted: false,
        $or: [
            { brand: new mongoose.Types.ObjectId(userId) },
            { influencer: new mongoose.Types.ObjectId(userId) },
        ],
    };

    if (status) matchStage.status = status;

    const result = await Collaboration.aggregate([
        { $match: matchStage },

        // join brand user info
        { $lookup: { from: "users", localField: "brand", foreignField: "_id", as: "brand" } },
        { $unwind: "$brand" },

        // join influencer user info
        { $lookup: { from: "users", localField: "influencer", foreignField: "_id", as: "influencer" } },
        { $unwind: "$influencer" },

        // join campaign info
        { $lookup: { from: "campaigns", localField: "campaign", foreignField: "_id", as: "campaign" } },
        { $unwind: { path: "$campaign", preserveNullAndEmptyArrays: true } },

        // map fields for frontend consistency
        {
            $project: {
                title: 1,
                status: 1,
                startDate: 1,
                endDate: 1,
                createdAt: 1,
                updatedAt: 1,
                brand: {
                    id: "$brand._id",
                    name: "$brand.fullname",
                    avatar: "$brand.profilePic"
                },
                influencer: {
                    id: "$influencer._id",
                    name: "$influencer.fullname",
                    username: "$influencer.username",
                    avatar: "$influencer.profilePic"
                },
                campaign: {
                    id: "$campaign._id",
                    title: "$campaign.title",
                    image: "$campaign.image"
                }
            }
        },

        { $sort: { createdAt: -1 } },

        // facet for pagination
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    const collaborations = result[0].data || [];
    const totalCount = result[0].totalCount[0]?.count || 0;

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            collaborations,
            total: totalCount,
            page: Number(page),
            pages: Math.ceil(totalCount / limit),
        }, "Collaborations fetched successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// GET /collaborations/:id
// Returns full details of a single collaboration
// ─────────────────────────────────────────────────────────────
const getCollaborationDetails = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;

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
        .populate("campaign")
        .populate("influencer", "fullname username email profilePic")
        .populate("brand", "fullname username email profilePic")
        .lean();

    if (!collaboration) {
        throw new ApiError(validationStatus.notFound, "Collaboration not found");
    }

    // Return a clean response optimized for frontend
    return res.status(validationStatus.ok).json(
        new ApiResponse(
            validationStatus.ok,
            {
                collaboration: {
                    ...collaboration,
                    influencer: undefined, // remove to avoid duplication
                    brand: undefined,      // remove to avoid duplication
                    campaign: undefined    // remove to avoid duplication
                },
                campaign: collaboration.campaign,
                brand: {
                    id: collaboration.brand?._id,
                    name: collaboration.brand?.fullname,
                    email: collaboration.brand?.email,
                    avatar: collaboration.brand?.profilePic
                },
                influencer: {
                    id: collaboration.influencer?._id,
                    name: collaboration.influencer?.fullname,
                    username: collaboration.influencer?.username,
                    email: collaboration.influencer?.email,
                    avatar: collaboration.influencer?.profilePic
                }
            },
            "Collaboration details fetched successfully"
        )
    );
});


// ─────────────────────────────────────────────────────────────
// GET /collaborations/:id/deliverables
// Returns all deliverables for a collaboration
// ─────────────────────────────────────────────────────────────

const getCollaborationDeliverables = AsyncHandler(async (req, res) => {
    const { id } = req.params;

    const collaboration = await Collaboration.findById(id)
        .select("deliverables").lean();

    if (!collaboration) {
        return res.status(validationStatus.notFound).json({
            message: "Collaboration not found",
        });
    }

    res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            total: collaboration.deliverables.length,
            deliverables: collaboration.deliverables,
        }, "Deliverables fetched successfully")
    );
});

// ─────────────────────────────────────────────────────────────
// PATCH /collaborations/:id/cancel
// Either party can cancel an active collaboration
// ─────────────────────────────────────────────────────────────
const cancelCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;
    const { reason } = req.body;

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only involved parties can cancel
    const isBrand = collaboration.brand.toString() === userId.toString();
    const isInfluencer = collaboration.influencer.toString() === userId.toString();
    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "You are not part of this collaboration");
    }

    if (["completed", "cancelled"].includes(collaboration.status)) {
        throw new ApiError(validationStatus.badRequest, `Collaboration is already ${collaboration.status}`);
    }

    collaboration.status = "cancelled";
    collaboration.cancellationReason = reason || null;
    collaboration.cancelledBy = userId;
    await collaboration.save();

    // notify the other party
    const notifyUser = isBrand ? collaboration.influencer : collaboration.brand;
    await emitActivity({
        user: notifyUser,
        role: isBrand ? "influencer" : "brand",
        type: "collaboration_cancelled",
        title: "Collaboration Cancelled",
        description: `A collaboration has been cancelled. Reason: ${reason || "No reason provided"}`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration cancelled successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// PATCH /collaborations/:id/complete
// Brand marks collaboration as completed (all deliverables done)
// ─────────────────────────────────────────────────────────────
const completeCollaboration = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only the brand can mark as complete
    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the brand can complete a collaboration");
    }

    if (collaboration.status === "completed") {
        throw new ApiError(validationStatus.badRequest, "Collaboration is already completed");
    }

    if (collaboration.status === "cancelled") {
        throw new ApiError(validationStatus.badRequest, "Cannot complete a cancelled collaboration");
    }

    // all deliverables should be approved or delivered before completing
    const unapproved = collaboration.deliverables.filter(
        (d) => !["APPROVED", "DELIVERED"].includes(d.status)
    );

    if (unapproved.length > 0) {
        throw new ApiError(
            validationStatus.badRequest,
            `${unapproved.length} deliverable(s) are not yet approved. Approve all deliverables before completing.`
        );
    }

    collaboration.status = "completed";
    collaboration.completedAt = new Date();
    await collaboration.save();

    // notify influencer
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "collaboration_completed",
        title: "Collaboration Completed",
        description: "The brand has marked the collaboration as completed. Great work!",
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, collaboration, "Collaboration completed successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// POST /collaborations/:id/deliverables
// Brand creates a new deliverable task for the influencer
// ─────────────────────────────────────────────────────────────
const createDeliverable = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;
    const { title, platform, description, dueDate } = req.body;

    if (!title || !platform || !dueDate) {
        throw new ApiError(validationStatus.badRequest, "title, platform, and dueDate are required");
    }

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only the brand can create deliverables
    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the brand can create deliverables");
    }

    if (!["active", "in_progress"].includes(collaboration.status)) {
        throw new ApiError(validationStatus.badRequest, "Can only add deliverables to active or in-progress collaborations");
    }

    // add new deliverable to the array
    collaboration.deliverables.push({ title, platform, description: description || "", dueDate });

    // auto-update status to in_progress once first deliverable is created
    if (collaboration.status === "active") {
        collaboration.status = "in_progress";
    }

    await collaboration.save();

    // notify influencer of new task
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "deliverable_created",
        title: "New Deliverable Added",
        description: `A new deliverable "${title}" has been added to your collaboration.`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.created).json(
        new ApiResponse(
            validationStatus.created,
            collaboration.deliverables[collaboration.deliverables.length - 1],
            "Deliverable created successfully"
        )
    );
});


// ─────────────────────────────────────────────────────────────
// GET /collaborations/:id/deliverables
// Anyone involved can list all deliverables
// ─────────────────────────────────────────────────────────────
const getDeliverables = AsyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(validationStatus.badRequest, "Invalid collaboration ID");
    }

    const collaboration = await Collaboration.findById(id).lean();
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    const isBrand = collaboration.brand.toString() === userId.toString();
    const isInfluencer = collaboration.influencer.toString() === userId.toString();
    if (!isBrand && !isInfluencer) {
        throw new ApiError(validationStatus.forbidden, "You are not part of this collaboration");
    }

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            deliverables: collaboration.deliverables,
        }, "Deliverables fetched successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// PATCH /collaborations/:id/deliverables/:deliverableId
// Influencer can update deliverable details (title, description, dueDate)
// ─────────────────────────────────────────────────────────────
const updateDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const userId = req.user._id;

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // influencer can update their own deliverable data
    if (collaboration.influencer.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the influencer can update deliverables");
    }

    // find the deliverable subdocument
    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    // only allow updates on non-approved deliverables
    if (["APPROVED", "DELIVERED"].includes(deliverable.status)) {
        throw new ApiError(validationStatus.badRequest, "Cannot update an approved or delivered deliverable");
    }

    const { title, description, dueDate } = req.body;
    if (title) deliverable.title = title;
    if (description) deliverable.description = description;
    if (dueDate) deliverable.dueDate = new Date(dueDate);

    await collaboration.save();

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, deliverable, "Deliverable updated successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// DELETE /collaborations/:id/deliverables/:deliverableId
// Brand can remove a deliverable
// ─────────────────────────────────────────────────────────────
const deleteDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const userId = req.user._id;

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only the brand can delete deliverables
    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the brand can delete deliverables");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    // prevent deleting a submitted/approved deliverable
    if (["SUBMITTED", "APPROVED", "DELIVERED"].includes(deliverable.status)) {
        throw new ApiError(validationStatus.badRequest, "Cannot delete a submitted or approved deliverable");
    }

    deliverable.deleteOne();
    await collaboration.save();

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Deliverable deleted successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// POST /collaborations/:id/deliverables/:deliverableId/submit
// Influencer submits their work for a deliverable
// ─────────────────────────────────────────────────────────────
const submitDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const userId = req.user._id;
    const { submissionFiles = [] } = req.body;

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only the influencer can submit
    if (collaboration.influencer.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the influencer can submit deliverables");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    if (deliverable.status === "APPROVED" || deliverable.status === "DELIVERED") {
        throw new ApiError(validationStatus.badRequest, "Deliverable is already approved or delivered");
    }

    // update deliverable status and submission data
    deliverable.status = "SUBMITTED";
    deliverable.submissionFiles = submissionFiles;
    deliverable.submittedAt = new Date();
    deliverable.revisionNotes = ""; // clear previous notes on resubmission

    // move collaboration to review stage
    if (collaboration.status === "in_progress") {
        collaboration.status = "review";
    }

    await collaboration.save();

    // notify the brand
    await emitActivity({
        user: collaboration.brand,
        role: "brand",
        type: "deliverable_submitted",
        title: "Deliverable Submitted",
        description: `The influencer has submitted "${deliverable.title}" for your review.`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, deliverable, "Deliverable submitted successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// PATCH /collaborations/:id/deliverables/:deliverableId/approve
// Brand approves a submitted deliverable
// ─────────────────────────────────────────────────────────────
const approveDeliverable = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const userId = req.user._id;

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only the brand can approve
    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the brand can approve deliverables");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    if (deliverable.status !== "SUBMITTED") {
        throw new ApiError(validationStatus.badRequest, "Only submitted deliverables can be approved");
    }

    deliverable.status = "APPROVED";
    deliverable.approvedAt = new Date();
    await collaboration.save();

    // notify the influencer
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "deliverable_approved",
        title: "Deliverable Approved",
        description: `"${deliverable.title}" has been approved by the brand. Great work!`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, deliverable, "Deliverable approved successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// PATCH /collaborations/:id/deliverables/:deliverableId/revision
// Brand requests changes on a submitted deliverable
// ─────────────────────────────────────────────────────────────

const requestRevision = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;
    const userId = req.user._id;
    const { revisionNotes } = req.body;

    if (!revisionNotes?.trim()) {
        throw new ApiError(validationStatus.badRequest, "Revision notes are required when requesting a revision");
    }

    const collaboration = await Collaboration.findById(id);
    if (!collaboration) throw new ApiError(validationStatus.notFound, "Collaboration not found");

    // only the brand can request revision
    if (collaboration.brand.toString() !== userId.toString()) {
        throw new ApiError(validationStatus.forbidden, "Only the brand can request revisions");
    }

    const deliverable = collaboration.deliverables.id(deliverableId);
    if (!deliverable) throw new ApiError(validationStatus.notFound, "Deliverable not found");

    if (deliverable.status !== "SUBMITTED") {
        throw new ApiError(validationStatus.badRequest, "Can only request revision on submitted deliverables");
    }

    deliverable.status = "REVISION_REQUESTED";
    deliverable.revisionNotes = revisionNotes.trim();

    // move collaboration back to in_progress
    if (collaboration.status === "review") {
        collaboration.status = "in_progress";
    }

    await collaboration.save();

    // notify the influencer
    await emitActivity({
        user: collaboration.influencer,
        role: "influencer",
        type: "revision_requested",
        title: "Revision Requested",
        description: `The brand has requested a revision on "${deliverable.title}". Notes: ${revisionNotes}`,
        relatedId: collaboration._id,
    });

    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, deliverable, "Revision requested successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// GET /collaborations/:id/progress
// Returns progress percentage of deliverables
// ─────────────────────────────────────────────────────────────
const getCollaborationProgress = AsyncHandler(async (req, res) => {
    const { id } = req.params;

    const collaboration = await Collaboration.findById(id).select("deliverables");

    if (!collaboration) {
        return res.status(validationStatus.notFound).json(
            new ApiResponse(validationStatus.notFound, {}, "Collaboration not found")
        );
    }

    const totalDeliverables = collaboration.deliverables.length;

    const completedDeliverables = collaboration.deliverables.filter(
        (d) => d.status === "APPROVED" || d.status === "DELIVERED"
    ).length;

    const progress =
        totalDeliverables === 0
            ? 0
            : Math.round((completedDeliverables / totalDeliverables) * 100);

    res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            totalDeliverables,
            completedDeliverables,
            progressPercentage: progress,
        }, "Collaboration progress fetched successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// GET /collaborations/:id/activity
// Returns last activity timestamp
// ─────────────────────────────────────────────────────────────

const getCollaborationActivity = AsyncHandler(async (req, res) => {
    const { id } = req.params;

    const collaboration = await Collaboration.findById(id).select(
        "deliverables updatedAt"
    );

    if (!collaboration) {
        return res.status(validationStatus.notFound).json(
            new ApiResponse(validationStatus.notFound, {}, "Collaboration not found")
        );
    }

    let lastActivity = collaboration.updatedAt;

    collaboration.deliverables.forEach((deliverable) => {
        if (deliverable.submittedAt && deliverable.submittedAt > lastActivity) {
            lastActivity = deliverable.submittedAt;
        }

        if (deliverable.approvedAt && deliverable.approvedAt > lastActivity) {
            lastActivity = deliverable.approvedAt;
        }
    });

    res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            lastActivity,
        }, "Collaboration activity fetched successfully")
    );
});


// ─────────────────────────────────────────────────────────────
// GET /collaborations/:id/deliverables/:deliverableId/submission
// Returns submission details for a specific deliverable
// ─────────────────────────────────────────────────────────────

const getDeliverableSubmission = AsyncHandler(async (req, res) => {
    const { id, deliverableId } = req.params;

    const collaboration = await Collaboration.findById(id).select("deliverables");

    if (!collaboration) {
        return res.status(validationStatus.notFound).json(
            new ApiResponse(validationStatus.notFound, {}, "Collaboration not found")
        );
    }

    const deliverable = collaboration.deliverables.id(deliverableId);

    if (!deliverable) {
        return res.status(validationStatus.notFound).json(
            new ApiResponse(validationStatus.notFound, {}, "Deliverable not found")
        );
    }

    res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {
            deliverableId: deliverable._id,
            title: deliverable.title,
            status: deliverable.status,
            submissionFiles: deliverable.submissionFiles,
            submittedAt: deliverable.submittedAt,
            revisionNotes: deliverable.revisionNotes,
            approvedAt: deliverable.approvedAt,
        }, "Deliverable submission fetched successfully")
    );
});



export {
    getCollaborations,
    getCollaborationDetails,
    getCollaborationDeliverables,
    cancelCollaboration,
    completeCollaboration,
    createDeliverable,
    getDeliverables,
    updateDeliverable,
    deleteDeliverable,
    submitDeliverable,
    approveDeliverable,
    requestRevision,
    getCollaborationProgress,
    getCollaborationActivity,
    getDeliverableSubmission,
};
