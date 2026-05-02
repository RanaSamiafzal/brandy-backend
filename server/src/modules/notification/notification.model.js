import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        type: {
            type: String,
            required: true
        },
        category: {
            type: String,
            default: "system"
        },
        title: {
            type: String,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        link: {
            type: String,
            default: ""
        },
        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null
        },
        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

NotificationSchema.index({ user: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', NotificationSchema);

export default Notification;
