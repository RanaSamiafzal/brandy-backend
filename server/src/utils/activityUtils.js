import Activity from "../modules/activity/activity.model.js"

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
        await Activity.create({
            user,
            role,
            type,
            title,
            description,
            relatedId,
            category: category || 'system'
        });
        
        // FUTURE: Socket.io emission would go here
        import('../app.js').then(({ app }) => {
            const io = app.get('socketio');
            if (io) {
                io.to(user.toString()).emit("notification", { 
                    title, 
                    description, 
                    type, 
                    relatedId,
                    category: category || 'system',
                    createdAt: new Date()
                });
                
                // Also emit a general "activity_created" for dashboard refreshes
                io.to(user.toString()).emit("activity_created", { category });
            }
        }).catch(err => console.error("Socket emit error:", err));

    } catch (error) {
        console.error("Error creating activity:", error);
        // We don't throw here to avoid breaking the main request flow if activity logging fails
    }
}

export { emitActivity }
