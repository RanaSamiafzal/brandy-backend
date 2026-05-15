import mongoose, { Schema } from "mongoose";

const aiMemorySchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        // Summarized context of user behavior
        aiSummary: {
            type: String,
            default: ""
        },
        // Rolling interaction history
        interactions: [
            {
                type: String,
                timestamp: { type: Date, default: Date.now }
            }
        ],
        // Trust and Risk Assessment
        riskLevel: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            default: "LOW"
        },
        trustScore: {
            type: Number,
            default: 50, // 0 to 100
            min: 0,
            max: 100
        },
        // Categorized History for AI Context
        history: {
            moderation: [
                {
                    action: String,
                    reason: String,
                    timestamp: { type: Date, default: Date.now }
                }
            ],
            complaints: [
                {
                    from: { type: Schema.Types.ObjectId, ref: "User" },
                    reason: String,
                    timestamp: { type: Date, default: Date.now }
                }
            ],
            payouts: [
                {
                    amount: Number,
                    status: String,
                    timestamp: { type: Date, default: Date.now }
                }
            ],
            suspiciousActivity: [
                {
                    activityType: String,
                    details: String,
                    timestamp: { type: Date, default: Date.now }
                }
            ]
        },
        lastUpdated: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true,
        collection: "ai_context_memory"
    }
);

// Index for rolling cleanup (TTL can be used or a manual job as requested)
// We'll use a manual job for the 30-day "rolling" logic to allow for summarization before deletion.
aiMemorySchema.index({ updatedAt: 1 });
aiMemorySchema.index({ riskLevel: 1, trustScore: -1 }); // For recommendation engine queries

const AiMemory = mongoose.model("AiMemory", aiMemorySchema);

export default AiMemory;
