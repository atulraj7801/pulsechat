import { createApp } from '../src/app.js';
import { createDatabase } from '../src/database/connection.js';
import { createLogger } from '../src/config/logger.js';
import { parseEnv } from '../src/config/env.js';
import Redis from 'ioredis';
import { fileURLToPath } from 'node:url';
export async function setup() {
  const env = parseEnv({
    NODE_ENV: 'test',
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ||
      'postgresql://pulsechat:pulsechat_local@127.0.0.1:5432/pulsechat_test',
    REDIS_URL: process.env.TEST_REDIS_URL || 'redis://127.0.0.1:6379/15',
    JWT_SECRET: 'integration-test-secret-at-least-32-characters',
    UPLOAD_SECRET: 'integration-upload-secret-at-least-32-characters',
    CORS_ORIGIN: 'http://localhost:5173',
    LOG_LEVEL: 'silent',
    UPLOAD_DIR: '../.local/test-uploads',
  });
  if (!new URL(env.DATABASE_URL).pathname.endsWith('_test'))
    throw new Error('Integration database name must end in _test. Tests truncate their database.');
  const db = createDatabase(env.DATABASE_URL),
    redis = new Redis(env.REDIS_URL),
    logger = createLogger('silent');
  await redis.ping();
  if (new URL(env.REDIS_URL).pathname !== '/15')
    throw new Error('Tests require dedicated Redis database 15.');
  const keys = await redis.keys('pulse:*');
  if (keys.length) await redis.del(...keys);
  await db.migrate.latest({
    directory: fileURLToPath(new URL('../src/database/migrations', import.meta.url)),
    loadExtensions: ['.js'],
  });
  await db.raw('TRUNCATE users, audit_logs CASCADE');
  const app = createApp({ db, redis, env, logger });
  app.locals.finalize();
  return {
    app,
    db,
    redis,
    env,
    logger,
    close: async () => {
      await db.destroy();
      await redis.quit();
    },
  };
}
