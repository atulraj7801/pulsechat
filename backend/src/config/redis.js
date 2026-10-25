import Redis from 'ioredis';
export function createRedis(url, logger) {
  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 250, 5000),
  });
  redis.on('error', () => logger.warn('Redis connection unavailable'));
  return redis;
}
