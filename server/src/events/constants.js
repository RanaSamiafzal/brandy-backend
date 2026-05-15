/**
 * Centralized Event Constants
 * 
 * Defines all internal platform events that can be emitted.
 */
export const EVENTS = {
    USER: {
        REGISTERED: "user:registered",
        LOGGED_IN: "user:logged_in",
        VERIFIED: "user:verified",
        REPORTED: "user:reported",
        BLOCKED: "user:blocked",
        UNBLOCKED: "user:unblocked"
    },
    CAMPAIGN: {
        CREATED: "campaign:created",
        UPDATED: "campaign:updated",
        DELETED: "campaign:deleted"
    },
    COLLABORATION: {
        REQUESTED: "collab:requested",
        ACCEPTED: "collab:accepted",
        REJECTED: "collab:rejected",
        STATUS_CHANGED: "collab:status_changed",
        PAYOUT_TRIGGERED: "collab:payout_triggered",
        PAYMENT_FAILED: "collab:payment_failed"
    },
    MESSAGE: {
        SENT: "message:sent"
    },
    NOTIFY: {
        SEND_PUSH: "notify:push",
        SEND_EMAIL: "notify:email"
    },
    SYSTEM: {
        AUDIT_LOG: "system:audit_log",
        SECURITY_ALERT: "system:security_alert"
    }
};

export const QUEUES = {
    NOTIFICATIONS: "notification_queue",
    MODERATION: "moderation_queue",
    ANALYTICS: "analytics_queue",
    AI: "ai_queue",
    EMAILS: "email_queue"
};
