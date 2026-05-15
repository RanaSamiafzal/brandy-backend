import mongoose, { Schema } from "mongoose";

const supportTicketSchema = new Schema(
    {
        ticketId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },
        type: {
            type: String,
            enum: ["FAQ", "ONBOARDING", "PAYMENT", "COLLABORATION", "COMPLAINT", "SUGGESTION", "OTHER"],
            required: true
        },
        subject: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
            default: "OPEN"
        },
        priority: {
            type: String,
            enum: ["LOW", "MEDIUM", "HIGH", "URGENT"],
            default: "MEDIUM"
        },
        // AI-related fields
        aiAssisted: {
            type: Boolean,
            default: false
        },
        aiSummary: {
            type: String
        },
        aiSuggestedResolution: {
            type: String
        },
        // Links to other entities
        relatedEntityId: {
            type: Schema.Types.ObjectId // Can be CampaignId, CollaborationId, or PayoutId
        },
        messages: [
            {
                sender: { type: Schema.Types.ObjectId, ref: "User" },
                text: String,
                timestamp: { type: Date, default: Date.now }
            }
        ],
        lastActivityAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true,
        collection: "support_tickets"
    }
);

// Prevent duplicate open tickets of the same type for the same user within 1 hour
supportTicketSchema.index({ userId: 1, type: 1, status: 1, createdAt: 1 }, { unique: false });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

export default SupportTicket;
