export async function up(db) { await db.schema.alterTable('messages', table => table.integer('version').notNullable().defaultTo(1)); }
export async function down(db) { await db.schema.alterTable('messages', table => table.dropColumn('version')); }
