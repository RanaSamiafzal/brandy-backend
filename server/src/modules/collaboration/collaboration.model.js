import mongoose, { Schema } from "mongoose";

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
        status: {
            type: String,
            enum: ["PENDING", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REVISION_REQUESTED", "DELIVERED"],
            default: "PENDING",
        },
        submissionFiles: {
            type: [String],
            default: [],
        },
        revisionNotes: {
            type: String,
            trim: true,
            default: "",
        },
        submittedAt: {
            type: Date,
            default: null,
        },
        approvedAt: {
            type: Date,
            default: null,
        },
    },
    { _id: true }
);

const collaborationSchema = new Schema(
    {
        brand: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        influencer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        campaign: {
            type: Schema.Types.ObjectId,
            ref: "Campaign",
            required: true,
        },
        request: {
            type: Schema.Types.ObjectId,
            ref: "CollaborationRequest",
            required: true,
            index: true,
            unique: true,
        },
        title: {
            type: String,
            required: [true, "Collaboration title is required"],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        agreedBudget: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: "USD",
            trim: true,
        },
        deliverables: {
            type: [deliverableSchema],
            default: [],
        },
        attachments: {
            type: [String],
            default: [],
        },
        notes: {
            type: String,
            trim: true,
            default: "",
        },
        status: {
            type: String,
            enum: ["active", "in_progress", "review", "completed", "cancelled", "paused"],
            default: "active",
            index: true,
        },
        review: {
            type: Schema.Types.ObjectId,
            ref: "Review",
        },
        actionRequest: {
            type: {
                type: String,
                enum: ["CANCEL", "COMPLETE", "RESUME", "NONE"],
                default: "NONE"
            },
            requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
            reason: { type: String, trim: true },
            status: { 
                type: String, 
                enum: ["PENDING", "APPROVED", "REJECTED", "IDLE"], 
                default: "IDLE" 
            },
            requestedAt: { type: Date }
        },
        cancellationReason: {
            type: String,
            trim: true,
            default: null,
        },
        cancelledBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        completedAt: {
            type: Date,
            default: null,
        },
        completedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
            default: null,
        },
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
        timestamps: true,
    }
);

collaborationSchema.index({ brand: 1, influencer: 1 });
collaborationSchema.index({ brand: 1, status: 1 });
collaborationSchema.index({ influencer: 1, status: 1 });
collaborationSchema.index({ isDeleted: 1, createdAt: -1 });

const Collaboration = mongoose.model("Collaboration", collaborationSchema);
export default Collaboration;
