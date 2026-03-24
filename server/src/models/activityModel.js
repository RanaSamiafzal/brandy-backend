// Activity tracks:
//         Campaign created
//         Request sent
//         Request accepted
//         Campaign completed
//         Profile updated

// When to Create Activity?
//     Inside controller, example:
//     When brand creates campaign:

//     await Activity.create({
//     user: req.user._id,
//     role: "brand",
//     type: "campaign_created",
//     title: "Campaign Created",
//     description: `You created ${campaign.title}`,
//     relatedId: campaign._id
//     });


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
            enum: ['brand', 'influencer', 'admin'], // fixed typo
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
        isDeleted: {            // added for soft delete
            type: Boolean,
            default: false
        },
        deletedAt: {            // track deletion time
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Index to quickly fetch user activities sorted by newest
ActivitySchema.index({ user: 1, createdAt: -1 });

const Activity = mongoose.model('Activity', ActivitySchema);

export default Activity;

