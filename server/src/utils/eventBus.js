import { EventEmitter } from "events";
import logger from "./logger.js";

/**
 * Platform Event Bus (Singleton)
 * 
 * Provides a decoupled way for modules to communicate.
 * Essential for future AI moderation hooks and real-time sync.
 */
class PlatformEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(20);
    }

    emit(event, ...args) {
        logger.debug(`Event Emitted: ${event}`);
        super.emit(event, ...args);
    }
}

export const eventBus = new PlatformEventBus();

// Core Event Definitions (Placeholders)
export const EVENTS = {
    USER: {
        REGISTERED: "user:registered",
        BLOCKED: "user:blocked",
        UNVERIFIED_GRACE_EXPIRED: "user:unverified_expired"
    },
    CAMPAIGN: {
        CREATED: "campaign:created",
        MODERATION_REQUIRED: "campaign:moderation_required"
    },
    COLLABORATION: {
        STATUS_CHANGED: "collab:status_changed",
        PAYOUT_TRIGGERED: "collab:payout_triggered"
    },
    SYSTEM: {
        AUDIT_LOG: "system:audit_log",
        SECURITY_ALERT: "system:security_alert"
    }
};
