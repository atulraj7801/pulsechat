import pg from 'pg';
import dotenv from 'dotenv';
import { resolve } from 'node:path';
dotenv.config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error('Run npm run setup and configure DATABASE_URL first.');
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const mode = process.argv[2] || 'overview';
  if (mode === 'messages') {
    const { rows } = await client.query(
      `SELECT m.id, COALESCE(c.name, '(direct)') AS conversation, u.username AS sender, length(m.body) AS characters, m.version, m.deleted_at IS NOT NULL AS deleted, m.created_at FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN users u ON u.id=m.sender_id ORDER BY m.created_at DESC,m.id DESC LIMIT 15`,
    );
    console.table(rows);
  } else if (mode === 'schema') {
    console.table(
      (
        await client.query(
          "SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
        )
      ).rows,
    );
  } else if (mode === 'overview') {
    for (const table of [
      'users',
      'conversations',
      'conversation_members',
      'messages',
      'message_reactions',
      'attachments',
      'notifications',
      'user_sessions',
      'refresh_tokens',
      'audit_logs',
    ]) {
      const { rows } = await client.query(`SELECT count(*) AS count FROM ${table}`);
      console.log(`${table.padEnd(24)} ${rows[0].count}`);
    }
    console.table(
      (
        await client.query(
          'SELECT id,type,name,is_private,created_at FROM conversations ORDER BY updated_at DESC LIMIT 10',
        )
      ).rows,
    );
  } else throw new Error('Usage: npm run db:inspect -- [overview|messages|schema]');
  await client.query('COMMIT');
} finally {
  await client.end();
}
