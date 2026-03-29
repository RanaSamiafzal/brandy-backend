import Activity from "./activity.model.js";
import { ApiError } from "../../utils/ApiError.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

/**
 * Get activities for a user
 */
const getActivities = async (userId, { page = 1, limit = 20 }) => {
    const skip = (page - 1) * limit;
    const activities = await Activity.find({ user: userId, isDeleted: false })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    const total = await Activity.countDocuments({ user: userId, isDeleted: false });

    return {
        activities,
        total,
        page: Number(page),
        pages: Math.ceil(total / limit),
    };
};

/**
 * Mark activity as read
 */
const markAsRead = async (activityId, userId) => {
    const activity = await Activity.findOneAndUpdate(
        { _id: activityId, user: userId },
        { isRead: true },
        { new: true }
    );
    if (!activity) throw new ApiError(validationStatus.notFound, "Activity not found");
    return activity;
};

/**
 * Mark all as read
 */
const markAllAsRead = async (userId) => {
    await Activity.updateMany(
        { user: userId, isRead: false },
        { isRead: true }
    );
};

/**
 * Soft delete activity
 */
const deleteActivity = async (activityId, userId) => {
    const activity = await Activity.findOneAndUpdate(
        { _id: activityId, user: userId },
        { isDeleted: true, deletedAt: new Date() },
        { new: true }
    );
    if (!activity) throw new ApiError(validationStatus.notFound, "Activity not found");
    return activity;
};

export const activityService = {
    getActivities,
    markAsRead,
    markAllAsRead,
    deleteActivity,
};
