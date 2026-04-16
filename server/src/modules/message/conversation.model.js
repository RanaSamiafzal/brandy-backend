import mongoose from "mongoose";

const ConversationSchema = new mongoose.Schema(
    {
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        lastMessage: {
            text: String,
            sender: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            isRead: {
                type: Boolean,
                default: false,
            },
            createdAt: Date,
        },
        campaign: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Campaign",
        },
        collaboration: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Collaboration",
        },
    },
    {
        timestamps: true,
    }
);

const Conversation = mongoose.model("Conversation", ConversationSchema);

export default Conversation;

