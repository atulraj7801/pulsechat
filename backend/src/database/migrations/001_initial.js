export async function up(db) {
  await db.raw('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await db.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('email', 254).notNullable().unique();
    t.string('username', 32).notNullable().unique();
    t.string('display_name', 80).notNullable();
    t.text('password_hash').notNullable();
    t.text('avatar_url');
    t.string('status', 16).notNullable().defaultTo('online');
    t.timestamp('last_seen_at', { useTz: true });
    t.timestamp('created_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
  });
  await db.schema.createTable('user_sessions', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('revoked_at', { useTz: true });
    t.timestamp('created_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
    t.index(['user_id', 'expires_at']);
  });
  await db.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('session_id').notNullable().references('user_sessions.id').onDelete('CASCADE');
    t.string('token_hash', 64).notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('used_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
  });
  await db.schema.createTable('conversations', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('type', 16).notNullable();
    t.string('name', 80);
    t.string('slug', 100).unique();
    t.string('description', 500).notNullable().defaultTo('');
    t.boolean('is_private').notNullable().defaultTo(false);
    t.uuid('created_by').notNullable().references('users.id');
    t.string('direct_key', 80).unique();
    t.timestamp('created_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
  });
  await db.schema.createTable('conversation_members', (t) => {
    t.uuid('conversation_id').notNullable().references('conversations.id').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('role', 16).notNullable().defaultTo('member');
    t.timestamp('joined_at', { useTz: true }).defaultTo(db.fn.now());
    t.uuid('last_read_message_id');
    t.timestamp('last_read_at', { useTz: true });
    t.timestamp('muted_until', { useTz: true });
    t.primary(['conversation_id', 'user_id']);
    t.index(['user_id', 'conversation_id']);
  });
  await db.schema.createTable('messages', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversation_id').notNullable().references('conversations.id').onDelete('CASCADE');
    t.uuid('sender_id').notNullable().references('users.id');
    t.text('body').notNullable().defaultTo('');
    t.string('message_type', 16).notNullable().defaultTo('text');
    t.uuid('reply_to_id').references('messages.id').onDelete('SET NULL');
    t.uuid('client_message_id').notNullable();
    t.timestamp('edited_at', { useTz: true });
    t.timestamp('deleted_at', { useTz: true });
    t.boolean('is_pinned').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
    t.timestamp('updated_at', { useTz: true, precision: 3 }).notNullable().defaultTo(db.fn.now());
    t.unique(['sender_id', 'client_message_id']);
    t.index(['conversation_id', 'created_at', 'id']);
  });
  await db.raw(
    "CREATE INDEX messages_search_idx ON messages USING GIN (to_tsvector('english', body)) WHERE deleted_at IS NULL",
  );
  await db.schema.createTable('message_reactions', (t) => {
    t.uuid('message_id').notNullable().references('messages.id').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.string('emoji', 32).notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
    t.primary(['message_id', 'user_id', 'emoji']);
  });
  await db.schema.createTable('attachments', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('conversation_id').notNullable().references('conversations.id').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('users.id');
    t.uuid('message_id').references('messages.id').onDelete('CASCADE');
    t.string('filename', 180).notNullable();
    t.string('mime_type', 80).notNullable();
    t.integer('size').notNullable();
    t.string('storage_key').notNullable().unique();
    t.timestamp('uploaded_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
  });
  await db.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('CASCADE');
    t.uuid('conversation_id').notNullable().references('conversations.id').onDelete('CASCADE');
    t.uuid('message_id').references('messages.id').onDelete('CASCADE');
    t.string('kind', 24).notNullable().defaultTo('message');
    t.string('title', 180).notNullable();
    t.timestamp('read_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
    t.index(['user_id', 'read_at', 'created_at']);
  });
  await db.schema.createTable('audit_logs', (t) => {
    t.bigIncrements('id');
    t.uuid('user_id').references('users.id').onDelete('SET NULL');
    t.string('action', 80).notNullable();
    t.uuid('resource_id');
    t.jsonb('metadata').notNullable().defaultTo('{}');
    t.timestamp('created_at', { useTz: true }).defaultTo(db.fn.now());
  });
  await db.raw(
    "ALTER TABLE conversations ADD CONSTRAINT conversation_type CHECK (type IN ('direct','group','channel'))",
  );
  await db.raw(
    "ALTER TABLE conversation_members ADD CONSTRAINT member_role CHECK (role IN ('owner','admin','member'))",
  );
  await db.raw(
    "ALTER TABLE users ADD CONSTRAINT user_status CHECK (status IN ('online','away','busy','offline'))",
  );
}
export async function down(db) {
  for (const table of [
    'audit_logs',
    'notifications',
    'attachments',
    'message_reactions',
    'messages',
    'conversation_members',
    'conversations',
    'refresh_tokens',
    'user_sessions',
    'users',
  ])
    await db.schema.dropTableIfExists(table);
}
