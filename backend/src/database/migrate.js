import { fileURLToPath } from 'node:url';
import { parseEnv } from '../config/env.js';
import { createDatabase, retryConnect } from './connection.js';
import { createLogger } from '../config/logger.js';
const env = parseEnv(process.env);
const db = createDatabase(env.DATABASE_URL);
try {
  await retryConnect(() => db.raw('select 1'), createLogger());
  await db.migrate.latest({
    directory: fileURLToPath(new URL('./migrations', import.meta.url)),
    loadExtensions: ['.js'],
  });
  console.log('Database migrations complete.');
} finally {
  await db.destroy();
}
