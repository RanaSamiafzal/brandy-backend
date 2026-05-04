import Activity from "../modules/activity/activity.model.js"
import Notification from "../modules/notification/notification.model.js"

/**
 * Creates an activity log entry.
 * This can be extended later to include real-time notifications (e.g. Socket.io, Push, Email).
 * 
 * @param {Object} params
 * @param {string} params.user - The user ID receiving the activity
 * @param {string} params.role - The role of the user (brand/influencer/admin)
 * @param {string} params.type - The type of activity (from activityModel enum)
 * @param {string} params.title - Title of the notification/activity
 * @param {string} params.description - Detailed description
 * @param {string} [params.relatedId] - Optional related record ID (campaign, collab, etc.)
 * @param {string} params.category - The category for frontend filtering (application/collaboration/message/system)
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

        // 2. Save to Notification model so the REST /notifications API returns it
        const notification = await Notification.create({
            user,
            type,
            category: category || 'system',
            title,
            message: description,   // frontend expects 'message', not 'description'
            relatedId,
            isRead: false
        });

        // 3. Emit real-time socket event with the correct event name the frontend listens for
        import('../app.js').then(({ app }) => {
            const io = app.get('socketio');
            if (io) {
                // Must match: newSocket.on('notification_received', ...) in SocketContext.jsx
                io.to(user.toString()).emit("notification_received", {
                    _id: notification._id,
                    title,
                    message: description,
                    type,
                    category: category || 'system',
                    relatedId,
                    isRead: false,
                    createdAt: notification.createdAt
                });

                // Also emit for dashboard badge refreshes
                io.to(user.toString()).emit("activity_created", { category });
            }
        }).catch(err => console.error("Socket emit error:", err));

    } catch (error) {
        console.error("Error creating activity:", error);
        // We don't throw here to avoid breaking the main request flow if activity logging fails
    }
}

export { emitActivity }
