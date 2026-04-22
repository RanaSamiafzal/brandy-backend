import Message from "./message.model.js";
import Conversation from "./conversation.model.js";
import Collaboration from "../collaboration/collaboration.model.js";

const getConversations = async (userId) => {
    let conversations = await Conversation.find({ participants: userId })
        .populate("participants", "fullname email profilePic role status lastActive verifiedPlatforms")
        .populate("campaign", "name image")
        .populate("collaboration", "status")
        .sort({ updatedAt: -1 });

    // Auto-healing for unlinked conversations
    const unlinkedIndices = conversations.reduce((acc, conv, i) => {
        if (!conv.collaboration) acc.push(i);
        return acc;
    }, []);

    if (unlinkedIndices.length > 0) {
        for (const index of unlinkedIndices) {
            const conv = conversations[index];
            const otherParticipantId = conv.participants.find(p => String(p._id) !== String(userId));
            
            if (otherParticipantId) {
                const latestCollab = await Collaboration.findOne({
                    $or: [
                        { brand: userId, influencer: otherParticipantId },
                        { brand: otherParticipantId, influencer: userId }
                    ],
                    status: { $in: ["active", "in_progress", "review"] },
                    isDeleted: false
                }).sort({ createdAt: -1 });

                if (latestCollab) {
                    // Update DB
                    await Conversation.findByIdAndUpdate(conv._id, {
                        collaboration: latestCollab._id,
                        campaign: latestCollab.campaign
                    });
                    
                    // Update local object for immediate response
                    // Re-populating manually or just fetching again is cleaner but this works for now
                    conv.collaboration = latestCollab;
                    conv.campaign = latestCollab.campaign; // Might need more population if name is needed
                }
            }
        }
        
        // Final refresh to ensure everything is populated correctly after healing
        conversations = await Conversation.find({ participants: userId })
            .populate("participants", "fullname email profilePic role status lastActive verifiedPlatforms")
            .populate("campaign", "name image")
            .populate("collaboration", "status")
            .sort({ updatedAt: -1 });
    }

    return conversations;
};

const getMessages = async (conversationId, userId) => {
    const conv = await Conversation.findById(conversationId);
    if (conv && conv.lastMessage && String(conv.lastMessage.sender) !== String(userId)) {
        await Conversation.findByIdAndUpdate(conversationId, {
            "lastMessage.isRead": true
        });
    }

    return await Message.find({ conversationId })
        .populate("sender", "fullname profilePic verifiedPlatforms")
        .populate("replyTo")
        .sort({ createdAt: 1 });
};

const createConversation = async (senderId, receiverId, campaignId = null, collaborationId = null) => {
    let query = {
        participants: { $all: [senderId, receiverId], $size: 2 }
    };

    // If a campaign is specified, we might want a specific conversation for that campaign
    // Or we just update the existing one. Given the UI, linking the MOST RECENT campaign
    // to the conversation between these two users is likely.
    if (campaignId) {
        query.campaign = campaignId;
    }

    let conversation = await Conversation.findOne(query);

    if (!conversation) {
        conversation = await Conversation.create({
            participants: [senderId, receiverId],
            campaign: campaignId,
            collaboration: collaborationId
        });
    } else if (campaignId || collaborationId) {
        // Update existing if new campaign/collaboration is provided
        conversation.campaign = campaignId || conversation.campaign;
        conversation.collaboration = collaborationId || conversation.collaboration;
        await conversation.save();
    }

    return conversation;
};

const sendMessage = async (conversationId, senderId, text, attachmentUrl = "", attachmentType = "", replyTo = null) => {
    // If text is empty but we have an attachment, let that pass, or default text
    const messageText = text || (attachmentUrl ? "Sent an attachment" : "");
    const message = await Message.create({
        conversationId,
        sender: senderId,
        text: messageText,
        attachmentUrl,
        attachmentType,
        replyTo
    });

    // Populate sender info
    const populatedMessage = await message.populate([{path: "sender", select: "fullname profilePic"}, {path: "replyTo"}]);

    // Update conversation and get participants
    const conversation = await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
            text: messageText,
            sender: senderId,
            createdAt: new Date(),
            isRead: false
        }
    }, { new: true }).select("participants");

    // Convert to JSON and attach participants for the socket to use
    const result = populatedMessage.toJSON();
    result.participants = conversation.participants;

    return result;
};

const markConversationAsRead = async (conversationId, userId) => {
    await Message.updateMany(
        { conversationId, sender: { $ne: userId }, isRead: false },
        { isRead: true }
    );

    const conv = await Conversation.findById(conversationId);
    if (conv && conv.lastMessage && String(conv.lastMessage.sender) !== String(userId)) {
        await Conversation.findByIdAndUpdate(conversationId, {
            "lastMessage.isRead": true
        });
    }
    return true;
};

const editMessage = async (messageId, senderId, newText) => {
    const updated = await Message.findOneAndUpdate(
        { _id: messageId, sender: senderId },
        { text: newText, isEdited: true },
        { new: true }
    ).populate([{path: "sender", select: "fullname profilePic"}, {path: "replyTo"}]);
    return updated;
};

const deleteMessageForMe = async (messageId, userId) => {
    const updated = await Message.findByIdAndUpdate(
        messageId,
        { $addToSet: { deletedFor: userId } },
        { new: true }
    );
    return updated;
};

const deleteMessageForEveryone = async (messageId, senderId) => {
    // Only sender can delete for everyone
    const updated = await Message.findOneAndUpdate(
        { _id: messageId, sender: senderId },
        { isDeletedForEveryone: true, text: "This message was deleted.", attachmentUrl: "", attachmentType: "" },
        { new: true }
    );
    return updated;
};

const bulkDeleteForMe = async (messageIds, userId) => {
    return await Message.updateMany(
        { _id: { $in: messageIds } },
        { $addToSet: { deletedFor: userId } }
    );
};

const reactToMessage = async (messageId, userId, emoji) => {
    const message = await Message.findById(messageId);
    if (!message) return null;
    
    // Check if user already reacted with this emoji
    const existingIndex = message.reactions.findIndex(r => r.user.toString() === userId.toString() && r.emoji === emoji);
    
    if (existingIndex > -1) {
        // Toggle off
        message.reactions.splice(existingIndex, 1);
    } else {
        // Toggle on
        message.reactions.push({ user: userId, emoji });
    }
    
    await message.save();
    return await Message.findById(messageId).populate([{path: "sender", select: "fullname profilePic"}, {path: "replyTo"}]);
};

export const messageService = { getConversations, getMessages, createConversation, sendMessage, markConversationAsRead, editMessage, deleteMessageForMe, deleteMessageForEveryone, bulkDeleteForMe, reactToMessage };
