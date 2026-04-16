import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        text: {
            type: String,
            required: true,
            trim: true,
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        attachmentUrl: {
            type: String,
            default: "",
        },
        attachmentType: {
            type: String,
            enum: ["image", "video", "raw", ""],
            default: "",
        },
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
            default: null,
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        deletedFor: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }],
        isDeletedForEveryone: {
            type: Boolean,
            default: false,
        },
        reactions: [{
            emoji: String,
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            }
        }],
    },
    {
        timestamps: true,
    }
);

const Message = mongoose.model("Message", MessageSchema);

export default Message;
