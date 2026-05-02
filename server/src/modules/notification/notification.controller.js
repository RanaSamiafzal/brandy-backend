import { notificationService } from "./notification.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

const getMyNotifications = AsyncHandler(async (req, res) => {
    const notifications = await notificationService.getUserNotifications(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, notifications, "Notifications fetched")
    );
});

const markNotificationRead = AsyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    const notification = await notificationService.markAsRead(notificationId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, notification, "Notification marked as read")
    );
});

const markAllRead = AsyncHandler(async (req, res) => {
    await notificationService.markAllAsRead(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, null, "All notifications marked as read")
    );
});

const removeNotification = AsyncHandler(async (req, res) => {
    const { notificationId } = req.params;
    await notificationService.deleteNotification(notificationId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, null, "Notification deleted")
    );
});

export const notificationController = {
    getMyNotifications,
    markNotificationRead,
    markAllRead,
    removeNotification
};
