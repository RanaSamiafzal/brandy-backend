import { messageService } from "./message.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";
import { uploadOnCloudinary } from "../../config/cloudinary.js";

const getConversations = AsyncHandler(async (req, res) => {
    const result = await messageService.getConversations(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Conversations fetched successfully")
    );
});

const getMessages = AsyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const result = await messageService.getMessages(conversationId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Messages fetched successfully")
    );
});

const createOrGetConversation = AsyncHandler(async (req, res) => {
    const { receiverId } = req.body;
    const result = await messageService.createConversation(req.user._id, receiverId);
    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, result, "Conversation retrieved/created successfully")
    );
});

const sendMessage = AsyncHandler(async (req, res) => {
    const { conversationId, text, attachmentUrl, attachmentType, replyTo } = req.body;
    const result = await messageService.sendMessage(conversationId, req.user._id, text, attachmentUrl, attachmentType, replyTo);
    return res.status(validationStatus.created).json(
        new ApiResponse(validationStatus.created, result, "Message sent successfully")
    );
});

const uploadAttachment = AsyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(validationStatus.badRequest).json(
            new ApiResponse(validationStatus.badRequest, null, "No file uploaded")
        );
    }
    const uploadResult = await uploadOnCloudinary(req.file.path);
    if (!uploadResult) {
         return res.status(validationStatus.internalServerError).json(
             new ApiResponse(validationStatus.internalServerError, null, "Error uploading to cloudinary")
         );
    }
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, { url: uploadResult.url }, "File uploaded successfully")
    );
});

const markAsRead = AsyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    await messageService.markConversationAsRead(conversationId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Messages marked as read successfully")
    );
});

const editMessage = AsyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { text } = req.body;
    const result = await messageService.editMessage(messageId, req.user._id, text);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Message edited")
    );
});

const deleteMessageForMe = AsyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const result = await messageService.deleteMessageForMe(messageId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Message deleted locally")
    );
});

const deleteMessageForEveryone = AsyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const result = await messageService.deleteMessageForEveryone(messageId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Message deleted globally")
    );
});

const bulkDeleteForMe = AsyncHandler(async (req, res) => {
    const { messageIds } = req.body;
    await messageService.bulkDeleteForMe(messageIds, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "Messages deleted locally")
    );
});

const reactToMessage = AsyncHandler(async (req, res) => {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const result = await messageService.reactToMessage(messageId, req.user._id, emoji);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Reaction updated")
    );
});

export const messageController = {
    getConversations,
    getMessages,
    createOrGetConversation,
    sendMessage,
    markAsRead,
    uploadAttachment,
    editMessage,
    deleteMessageForMe,
    deleteMessageForEveryone,
    bulkDeleteForMe,
    reactToMessage
};
