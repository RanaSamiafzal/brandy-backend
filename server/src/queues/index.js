import { createWorker, closeWorkers } from './baseWorker.js';
import { getQueue } from './queueManager.js';
import { QUEUES } from '../events/constants.js';
import { memoryService } from '../modules/aiMemory/memory.service.js';
import logger from '../utils/logger.js';

import { sendNotification } from '../utils/notificationUtils.js';
import { sendEmail } from '../utils/email.js';

/**
 * Worker Registration
 * 
 * Initializes all background workers.
 */
export const startWorkers = async () => {
    logger.info('Starting Background Workers...');

    // 1. Notification Worker
    createWorker(QUEUES.NOTIFICATIONS, async (job) => {
        const { userId, type, title, message, link, relatedId } = job.data;
        
        await sendNotification({
            user: userId,
            type,
            title,
            message,
            link,
            relatedId
        });
        
        logger.info(`[NotificationWorker] Notification sent to ${userId}`);
    });

    // 2. Email Worker
    createWorker(QUEUES.EMAILS, async (job) => {
        const { to, subject, name, template } = job.data;
        
        let html = '';
        if (job.name === 'welcome_email') {
            html = `<h1>Welcome ${name}!</h1><p>Thanks for joining Brandy.</p>`;
        }

        await sendEmail({
            to,
            subject: subject || 'Brandy Update',
            html
        });
        
        logger.info(`[EmailWorker] Email sent to ${to}`);
    });

    // 3. Analytics/Audit Worker
    createWorker(QUEUES.ANALYTICS, async (job) => {
        if (job.name === 'prune_ai_memory') {
            await memoryService.runPruningJob();
            return;
        }
        
        // Log to database (Placeholder for Activity model)
        logger.info(`[AnalyticsWorker] Processing activity log for user: ${job.data.userId}`);
    });

    // 4. Moderation Worker
    createWorker(QUEUES.MODERATION, async (job) => {
        const { userId, type, details } = job.data;
        logger.info(`[ModerationWorker] Processing ${type} for user ${userId}`);
        
        // Potential for automated content scanning or advanced fraud detection
        if (type === 'AUTO_FRAUD_CHECK') {
            const { moderationService } = await import('../modules/moderation/moderation.service.js');
            await moderationService.detectFraud(userId, details);
        }
    });

    // Schedule repeatable jobs
    const analyticsQueue = getQueue(QUEUES.ANALYTICS);
    await analyticsQueue.add('prune_ai_memory', {}, {
        repeat: { pattern: '0 0 * * *' } // Every night at midnight
    });

    logger.info('✅ All Workers Started.');
};

export { closeWorkers };
