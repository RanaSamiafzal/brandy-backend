import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['brand', 'influencer', 'admin', 'user'],
            required: true
        },
        type: {
            type: String,
            enum: [
                "campaign_created",
                "campaign_updated",
                "campaign_deleted",
                "request_sent",
                "request_accepted",
                "request_rejected",
                "request_cancelled",
                "profile_updated",
                "password_changed",
                "collaboration_request_sent",
                "collaboration_request_received",
                "collaboration_accepted",
                "collaboration_started",
                "collaboration_active",
                "collaboration_paused",
                "collaboration_suspended",
                "collaboration_cancelled",
                "collaboration_completed",
                "deliverable_created",
                "deliverable_updated",
                "deliverable_submitted",
                "deliverable_approved",
                "deliverable_approved_paid",
                "deliverable_revision_requested",
                "revision_requested",
                "collab_request_cancel",
                "collab_request_complete",
                "collab_request_resume",
                "collab_request_rejected",
                "collab_request_approved",
                "influencer_review_received",
                "escrow_funded"
            ],
            required: true
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            default: ""
        },
        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        isRead: {
            type: Boolean,
            default: false
        },
        isDeleted: {
            type: Boolean,
            default: false
        },
        deletedAt: {
            type: Date,
            default: null
        },
        category: {
            type: String,
            enum: ['application', 'collaboration', 'message', 'system'],
            required: true
        }
    },
    {
        timestamps: true
    }
);

ActivitySchema.index({ user: 1, createdAt: -1 });

const Activity = mongoose.model('Activity', ActivitySchema);

export default Activity;
