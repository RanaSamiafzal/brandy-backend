import Notification from "./notification.model.js";

const getUserNotifications = async (userId, limit = 20) => {
    return await Notification.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit);
};

const markAsRead = async (notificationId, userId) => {
    return await Notification.findOneAndUpdate(
        { _id: notificationId, user: userId },
        { $set: { isRead: true } },
        { new: true }
    );
};

const markAllAsRead = async (userId) => {
    return await Notification.updateMany(
        { user: userId, isRead: false },
        { $set: { isRead: true } }
    );
};

const deleteNotification = async (notificationId, userId) => {
    return await Notification.deleteOne({ _id: notificationId, user: userId });
};

const createNotification = async (data) => {
    return await Notification.create(data);
};

export const notificationService = {
    getUserNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    createNotification
};
