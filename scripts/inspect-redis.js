import Redis from 'ioredis';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
if (!process.env.REDIS_URL) throw new Error('Run npm run setup and configure REDIS_URL first.');
const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});
redis.on('error', () => {});
try {
  console.log(`Redis: ${await redis.ping()}`);
  let cursor = '0';
  const rows = [];
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'pulse:*', 'COUNT', 50);
    cursor = next;
    for (const key of keys)
      rows.push({ key, type: await redis.type(key), ttl_seconds: await redis.ttl(key) });
  } while (cursor !== '0' && rows.length < 200);
  console.table(rows);
  console.log(
    'Only key metadata is shown. Profile, session, and credential values are not printed.',
  );
} finally {
  await redis.quit();
}
