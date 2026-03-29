import { activityService } from "./activity.service.js";
import { AsyncHandler } from "../../utils/Asynchandler.js";
import { ApiResponse } from "../../utils/ApiResponse.js";
import { validationStatus } from "../../utils/ValidationStatusCode.js";

/**
 * Handle fetching activities
 */
const getActivities = AsyncHandler(async (req, res) => {
    const result = await activityService.getActivities(req.user._id, req.query);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, result, "Activities fetched successfully")
    );
});

/**
 * Handle marking activity as read
 */
const markAsRead = AsyncHandler(async (req, res) => {
    const { activityId } = req.params;
    const activity = await activityService.markAsRead(activityId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, activity, "Activity marked as read")
    );
});

/**
 * Handle marking all activities as read
 */
const markAllAsRead = AsyncHandler(async (req, res) => {
    await activityService.markAllAsRead(req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, {}, "All activities marked as read")
    );
});

/**
 * Handle deleting an activity
 */
const deleteActivity = AsyncHandler(async (req, res) => {
    const { activityId } = req.params;
    const activity = await activityService.deleteActivity(activityId, req.user._id);
    return res.status(validationStatus.ok).json(
        new ApiResponse(validationStatus.ok, activity, "Activity deleted successfully")
    );
});

export const activityController = {
    getActivities,
    markAsRead,
    markAllAsRead,
    deleteActivity,
};
