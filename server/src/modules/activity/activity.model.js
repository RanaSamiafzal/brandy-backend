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
            enum: ['brand', 'influencer', 'admin'],
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
                "collaboration_accepted",
                "collaboration_started",
                "collaboration_cancelled",
                "collaboration_completed",
                "deliverable_created",
                "deliverable_submitted",
                "deliverable_approved",
                "revision_requested"
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
