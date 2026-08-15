import Conversation from "../modules/message/conversation.model.js";
import Collaboration from "../modules/collaboration/collaboration.model.js";
import Message from "../modules/message/message.model.js";
import mongoose from "mongoose";
import { isListedMember } from "../utils/sanitizeSecrets.js";

export const canJoinRoom = async (userId, roomId) => {
    if (!userId || !roomId || !mongoose.isValidObjectId(roomId)) return false;

    const conv = await Conversation.findById(roomId).select("participants").lean();
    if (conv && isListedMember(userId, conv.participants)) return true;

    const collab = await Collaboration.findById(roomId).select("brand influencer").lean();
    if (
        collab &&
        (String(collab.brand) === String(userId) || String(collab.influencer) === String(userId))
    ) {
        return true;
    }

    return false;
};

export const getAuthorizedConversation = async (userId, conversationId) => {
    if (!userId || !conversationId || !mongoose.isValidObjectId(conversationId)) return null;
    const conv = await Conversation.findById(conversationId).select("participants").lean();
    if (!conv || !isListedMember(userId, conv.participants)) return null;
    return conv;
};

export const getAuthorizedMessage = async (userId, messageId, conversationId) => {
    if (!messageId || !mongoose.isValidObjectId(messageId)) return null;
    const msg = await Message.findById(messageId).select("sender conversationId").lean();
    if (!msg) return null;
    if (conversationId && String(msg.conversationId) !== String(conversationId)) return null;
    const conv = await getAuthorizedConversation(userId, msg.conversationId);
    if (!conv) return null;
    return msg;
};
