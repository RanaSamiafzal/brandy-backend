import mongoose, { Schema } from "mongoose";

// ─────────────────────────────────────────────
// Deliverable Sub-Schema
// Represents a single piece of work the influencer 
// must deliver as part of the collaboration agreement.
// ─────────────────────────────────────────────
const deliverableSchema = new Schema(
    {
        title: {
            type: String,
            required: [true, "Deliverable title is required"],
            trim: true,
        },

        platform: {
            type: String,
            enum: ["instagram", "youtube", "tiktok", "twitter", "linkedin", "facebook", "other"],
            required: [true, "Platform is required"],
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        dueDate: {
            type: Date,
            required: [true, "Due date is required"],
        },

        // Deliverable lifecycle:
        // pending → submitted → revision_requested → approved → completed
        status: {
            type: String,
            enum: ["pending", "submitted", "revision_requested", "approved", "completed"],
            default: "pending",
        },

        // Files submitted by the influencer (cloudinary URLs or similar)
        submissionFiles: {
            type: [String],
            default: [],
        },

        // Feedback notes from brand when requesting a revision
        revisionNotes: {
            type: String,
            trim: true,
            default: "",
        },

        // Track when the influencer submitted the deliverable
        submittedAt: {
            type: Date,
            default: null,
        },

        // Track when the brand approved the deliverable
        approvedAt: {
            type: Date,
            default: null,
        },
    },
    { _id: true } // each deliverable gets its own _id for easy reference
);


// ─────────────────────────────────────────────
// Main Collaboration Schema
// Created automatically when a CollaborationRequest 
// is accepted by the influencer.
// ─────────────────────────────────────────────
const collaborationSchema = new Schema(
    {
        // ── Relationships ──────────────────────────
        // The brand user who initiated the request
        brand: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // The influencer user who received the request
        influencer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        // The campaign this collaboration is part of
        campaign: {
            type: Schema.Types.ObjectId,
            ref: "Campaign",
            required: true,
        },

        // The originating collaboration request that was accepted
        request: {
            type: Schema.Types.ObjectId,
            ref: "CollaborationRequest",
            required: true,
            index: true,
            unique: true, // one collaboration per accepted request
        },

        // ── Financial Terms ─────────────────────────
        // finalised budget agreed upon at acceptance
        agreedBudget: {
            type: Number,
            required: true,
            min: 0,
        },

        // Currency code (default: USD)
        currency: {
            type: String,
            default: "USD",
            trim: true,
        },

        // ── Deliverables ────────────────────────────
        deliverables: {
            type: [deliverableSchema],
            default: [],
        },

        // ── Lifecycle ───────────────────────────────
        // Collaboration lifecycle:
        // active → in_progress → review → completed | cancelled
        status: {
            type: String,
            enum: ["active", "in_progress", "review", "completed", "cancelled"],
            default: "active",
            index: true,
        },

        // Reason if the collaboration is cancelled
        cancellationReason: {
            type: String,
            trim: true,
            default: null,
        },

        // Who cancelled it (if cancelled)
        cancelledBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        // ── Timeline ────────────────────────────────
        startDate: {
            type: Date,
            default: Date.now,
        },

        // Expected completion date
        endDate: {
            type: Date,
            default: null,
        },

        // When it was actually completed
        completedAt: {
            type: Date,
            default: null,
        },

        // ── Soft delete ─────────────────────────────
        isDeleted: {
            type: Boolean,
            default: false,
        },

        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true, // createdAt, updatedAt
    }
);


// ─────────────────────────────────────────────
// Indexes for query performance
// ─────────────────────────────────────────────

// Compound index to quickly find all collaborations between a specific brand and influencer
collaborationSchema.index({ brand: 1, influencer: 1 });

// Compound index to filter by status for brand dashboard queries
collaborationSchema.index({ brand: 1, status: 1 });

// Compound index to filter by status for influencer dashboard queries
collaborationSchema.index({ influencer: 1, status: 1 });

// Filter active (non-deleted) collaborations sorted by creation date
collaborationSchema.index({ isDeleted: 1, createdAt: -1 });


// ─────────────────────────────────────────────
// Export the model
// ─────────────────────────────────────────────
const Collaboration = mongoose.model("Collaboration", collaborationSchema);
export default Collaboration;
