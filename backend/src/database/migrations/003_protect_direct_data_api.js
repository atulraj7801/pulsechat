// Hosted PostgreSQL platforms may expose public tables through generated APIs.
// PulseChat authorizes through Express, using the table-owning database role.
const tables = [
  'users',
  'refresh_tokens',
  'user_sessions',
  'conversations',
  'conversation_members',
  'messages',
  'message_reactions',
  'attachments',
  'notifications',
  'audit_logs',
];
export async function up(db) {
  for (const table of tables) await db.raw('ALTER TABLE ?? ENABLE ROW LEVEL SECURITY', [table]);
}
export async function down(db) {
  for (const table of tables) await db.raw('ALTER TABLE ?? DISABLE ROW LEVEL SECURITY', [table]);
}
