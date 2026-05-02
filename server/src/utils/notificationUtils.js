import Notification from "../modules/notification/notification.model.js";

/**
 * Creates an in-app notification and emits it via socket.io
 * 
 * @param {Object} params
 * @param {string} params.user - The user ID receiving the notification
 * @param {string} params.type - The type of notification
 * @param {string} params.title - Title
 * @param {string} params.message - Message
 * @param {string} [params.link] - Optional link for redirect
 * @param {string} [params.relatedId] - Optional related record ID
 */
export const sendNotification = async ({ user, type, title, message, link = "", relatedId = null }) => {
    try {
        const notification = await Notification.create({
            user,
            type,
            title,
            message,
            link,
            relatedId
        });

        // Emit via Socket.io
        import('../app.js').then(({ app }) => {
            const io = app.get('socketio');
            if (io) {
                io.to(user.toString()).emit("notification_received", notification);
            }
        }).catch(err => console.error("Socket notification error:", err));

        return notification;
    } catch (error) {
        console.error("Error sending notification:", error);
    }
};
