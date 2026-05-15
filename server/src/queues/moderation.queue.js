import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import Message from '../modules/message/message.model.js';

// Setup Redis connection for BullMQ
const redisConnection = new Redis(process.env.REDIS_HOST || '127.0.0.1', {
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: null,
});

export const moderationQueue = new Queue('moderation-scan-queue', {
  connection: redisConnection,
});

const ABUSE_KEYWORDS = [
  'kill you', 'beat you', 'hurt you', 'stab', 'rape', 'harass',
  'i will find you', 'where do you live', 'send me your address',
  'send nudes', 'send pics', 'hot girl', 'sexy', 'sleep with me',
  'meet me alone', 'come to my place', 'you are mine', 'wanna hook up',
  'slut', 'whore', 'bitch', 'hoe', 'prostitute',
  'pay me outside', 'cash app me', 'western union', 'send money first',
  'i will pay double', 'off platform',
];

// Worker processes the queue
const moderationWorker = new Worker('moderation-scan-queue', async (job) => {
  if (job.name === 'daily-scan') {
    console.log('Running daily moderation scan...');
    // Scan messages from last 24 hours
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messages = await Message.find({ 
      isDeletedForEveryone: false,
      createdAt: { $gte: dayAgo }
    }).populate('sender', 'fullname email isBlocked');

    const flagged = [];
    for (const msg of messages) {
      const text = (msg.text || '').toLowerCase();
      const matchedKeywords = ABUSE_KEYWORDS.filter(kw => text.includes(kw));

      if (matchedKeywords.length >= 3) {
        // High risk detected
        flagged.push({ messageId: msg._id, senderId: msg.sender._id, keywords: matchedKeywords });
      }
    }

    if (flagged.length > 0) {
      console.log(`Daily scan complete: ${flagged.length} high-risk messages flagged.`);
      // In a real scenario, this would notify the admin via an internal dashboard alert or email
    } else {
      console.log('Daily scan complete: 0 high-risk messages found.');
    }
    
    return { scanned: messages.length, flaggedCount: flagged.length };
  }
}, { connection: redisConnection });

moderationWorker.on('completed', (job) => {
  console.log(`Job with id ${job.id} has been completed`);
});

moderationWorker.on('failed', (job, err) => {
  console.error(`Job with id ${job.id} has failed with ${err.message}`);
});
