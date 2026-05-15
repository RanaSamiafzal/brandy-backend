import mongoose, { Schema } from "mongoose";

const moderationLogSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        adminId: {
            type: Schema.Types.ObjectId,
            ref: "User" // Optional, null if AI-generated
        },
        type: {
            type: String,
            enum: ["FLAG", "WARN", "BLOCK", "TRUST_ADJUSTMENT", "FRAUD_ALERT"],
            required: true
        },
        reason: {
            type: String,
            required: true
        },
        trustChange: {
            type: Number,
            default: 0
        },
        metadata: {
            type: Schema.Types.Mixed // Flexible storage for evidence/details
        },
        status: {
            type: String,
            enum: ["PENDING_REVIEW", "APPROVED", "REJECTED", "AUTO_RESOLVED"],
            default: "AUTO_RESOLVED"
        }
    },
    {
        timestamps: true,
        collection: "moderation_logs"
    }
);

// Index for auditing
moderationLogSchema.index({ type: 1, createdAt: -1 });

const ModerationLog = mongoose.model("ModerationLog", moderationLogSchema);

export default ModerationLog;
