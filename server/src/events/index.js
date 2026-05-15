import eventBus from './eventBus.js';
import { EVENTS, QUEUES } from './constants.js';
import { addJob } from '../queues/queueManager.js';
import { memoryService } from '../modules/aiMemory/memory.service.js';
import logger from '../utils/logger.js';

/**
 * Listener Registration
 * 
 * Maps internal events to background jobs or modular side effects.
 */
export const registerListeners = () => {
    logger.info('Registering Platform Event Listeners...');

    // 1. User Events
    eventBus.on(EVENTS.USER.REGISTERED, async (user) => {
        logger.info(`Event: USER.REGISTERED for ${user.email}`);
        
        // Push welcome email to queue
        await addJob(QUEUES.EMAILS, 'welcome_email', {
            to: user.email,
            name: user.fullname
        });

        // Log activity
        eventBus.emit(EVENTS.SYSTEM.AUDIT_LOG, {
            userId: user._id,
            action: 'REGISTER',
            details: 'User registered on platform'
        });
    });

    eventBus.on(EVENTS.USER.LOGGED_IN, async (user) => {
        // Update last active, logs, etc. via queue
        await addJob(QUEUES.ANALYTICS, 'login_activity', {
            userId: user._id,
            timestamp: new Date()
        });
    });

    // 2. Collaboration Events
    eventBus.on(EVENTS.COLLABORATION.STATUS_CHANGED, async (collab) => {
        // Trigger notification
        await addJob(QUEUES.NOTIFICATIONS, 'status_update', {
            userId: collab.brand,
            type: 'COLLAB_UPDATE',
            title: 'Collaboration Status Changed',
            message: `Collaboration "${collab.title}" is now ${collab.status}`
        });
    });

    // 3. System & AI Memory Events
    eventBus.on(EVENTS.SYSTEM.AUDIT_LOG, async (data) => {
        await addJob(QUEUES.ANALYTICS, 'audit_log', data);
    });

    // AI Memory Integration
    eventBus.on(EVENTS.USER.BLOCKED, async ({ userId, reason }) => {
        await memoryService.recordEvent(userId, 'moderation', {
            action: 'BLOCK',
            reason,
            timestamp: new Date()
        });
        await memoryService.summarizeContext(userId);
    });

    eventBus.on(EVENTS.COLLABORATION.PAYOUT_TRIGGERED, async ({ userId, amount }) => {
        await memoryService.recordEvent(userId, 'payouts', {
            amount,
            status: 'COMPLETED',
            timestamp: new Date()
        });
        await memoryService.summarizeContext(userId);
    });

    eventBus.on(EVENTS.MESSAGE.SENT, async ({ senderId, text }) => {
        // AI records a brief interaction summary
        await memoryService.addInteractionSummary(senderId, `Sent message: ${text.substring(0, 50)}...`);
    });

    eventBus.on(EVENTS.USER.REPORTED, async ({ targetId, reporterId, reason }) => {
        await memoryService.recordEvent(targetId, 'complaints', {
            reporterId,
            reason,
            timestamp: new Date()
        });
        await memoryService.summarizeContext(targetId);
    });

    eventBus.on(EVENTS.COLLABORATION.PAYMENT_FAILED, async ({ userId, reason }) => {
        await memoryService.recordEvent(userId, 'suspiciousActivity', {
            type: 'PAYMENT_FAILURE',
            reason,
            timestamp: new Date()
        });
    });

    eventBus.on(EVENTS.SYSTEM.SECURITY_ALERT, async (data) => {
        logger.warn(`[Security Alert] User ${data.userId}: ${data.type}`);
        // Log to analytics queue for admin dashboard
        await addJob(QUEUES.ANALYTICS, 'security_alert', data);
    });

    logger.info('✅ All Listeners Registered.');
};
