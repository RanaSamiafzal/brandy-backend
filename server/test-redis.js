import Redis from 'ioredis';

const redis = new Redis({
  host: 'amusing-crab-152768.upstash.io',
  port: 6379,
  password: 'gQAAAAAAAlTAAAIgcDIxYTRkNzQ2MzgwZmY0YTlkOTczYThhZTlkYjE5N2NmYQ',
  tls: {}
});

redis.on('connect', () => {
  console.log('✅ Connected to Upstash successfully!');
  redis.quit();
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
  process.exit(1);
});
