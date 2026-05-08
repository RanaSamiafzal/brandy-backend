import Activity from "../modules/activity/activity.model.js"
import Notification from "../modules/notification/notification.model.js"
import { socketManager } from "../config/socketManager.js"

/**
 * Creates an activity log entry and emits real-time notifications via Socket.io.
 */
const emitActivity = async ({ user, role, type, title, description, relatedId = null, category }) => {
    try {
        // 1. Save to Activity log
        await Activity.create({
            user,
            role,
            type,
            title,
            description,
            relatedId,
            category: category || 'system'
        });

        // 2. Save to Notification model
        const notification = await Notification.create({
            user,
            type,
            category: category || 'system',
            title,
            message: description,
            relatedId,
            isRead: false
        });

        // 3. Emit real-time socket events
        const userId = user?.toString();
        if (userId) {
            socketManager.emitToUser(userId, "notification_received", {
                _id: notification._id,
                title,
                message: description,
                type,
                category: category || 'system',
                relatedId,
                isRead: false,
                createdAt: notification.createdAt
            });

            socketManager.emitToUser(userId, "activity_created", { category, type, relatedId });
        }

    } catch (error) {
        console.error("Error in emitActivity:", error);
    }
};

export { emitActivity };
