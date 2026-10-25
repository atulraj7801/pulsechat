import { createServer } from 'node:http';
import { parseEnv } from './config/env.js';
import { createLogger } from './config/logger.js';
import { createDatabase, retryConnect } from './database/connection.js';
import { createRedis } from './config/redis.js';
import { createApp } from './app.js';
import { attachSockets } from './sockets/index.js';
import { startCleanup } from './jobs/cleanup.js';
const env = parseEnv(process.env),
  logger = createLogger(env.LOG_LEVEL);
const db = createDatabase(env.DATABASE_URL),
  redis = createRedis(env.REDIS_URL, logger);
await retryConnect(() => db.raw('select 1'), logger);
redis.connect().catch(() => logger.warn('Initial Redis connection failed; retrying'));
await retryConnect(() => redis.ping(), logger);
const app = createApp({ db, redis, env, logger });
app.locals.finalize();
const server = createServer(app);
const sockets = await attachSockets(server, {
  services: app.locals.services,
  db,
  redis,
  env,
  logger,
});
const stopCleanup = startCleanup({ db, redis, env, logger });
server.listen(env.PORT, () => logger.info({ port: env.PORT }, 'PulseChat API ready'));
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  logger.info('Gracefully shutting down');
  stopCleanup();
  const timeout = setTimeout(() => process.exit(1), 10000).unref();
  await sockets.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await Promise.all([db.destroy(), redis.quit()]);
  clearTimeout(timeout);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
