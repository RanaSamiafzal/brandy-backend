import cron from 'node-cron';
import { moderationQueue } from '../../queues/moderation.queue.js';

/**
 * Initializes all cron jobs for the admin module.
 */
export const initAdminCronJobs = () => {
  // Run daily at midnight server time
  cron.schedule('0 0 * * *', async () => {
    console.log('Cron Trigger: Scheduling daily moderation scan');
    await moderationQueue.add('daily-scan', {}, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 }
    });
  });

  console.log('Admin cron jobs initialized.');
};
