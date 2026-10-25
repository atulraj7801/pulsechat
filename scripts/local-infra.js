// Optional developer helper. Production always uses external PostgreSQL and Redis.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const root = resolve(import.meta.dirname, '..');
const redisBinary =
  process.env.REDIS_BINARY || resolve(root, '.local/redis-7.4.7/src/redis-server');
if (!existsSync(redisBinary))
  throw new Error('Redis binary unavailable. Use Docker Compose or set REDIS_BINARY.');
const pg = new EmbeddedPostgres({
  databaseDir: resolve(root, '.local/postgres'),
  user: 'pulsechat',
  password: 'pulsechat_local',
  port: 5432,
  persistent: true,
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(resolve(root, '.local/postgres/PG_VERSION'))) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('pulsechat');
} catch (err) {
  if (!String(err).includes('already exists')) throw err;
}
const redis = spawn(
  redisBinary,
  [
    '--bind',
    '127.0.0.1',
    '--port',
    '6379',
    '--dir',
    resolve(root, '.local'),
    '--appendonly',
    'yes',
  ],
  { stdio: 'ignore' },
);
console.log('Local PostgreSQL :5432 and Redis :6379 running. Ctrl+C stops both.');
async function stop() {
  redis.kill('SIGTERM');
  await pg.stop();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
