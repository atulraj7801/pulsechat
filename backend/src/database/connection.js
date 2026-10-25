import knex from 'knex';
import { Model } from 'objection';
export function createDatabase(url) {
  const db = knex({
    client: 'pg',
    connection: url,
    pool: { min: 0, max: 15 },
    acquireConnectionTimeout: 10000,
  });
  Model.knex(db);
  return db;
}
export async function retryConnect(check, logger, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await check();
      return;
    } catch (err) {
      if (attempt === attempts) throw err;
      logger.warn({ attempt }, 'Dependency unavailable; retrying');
      await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 5000)));
    }
  }
}
