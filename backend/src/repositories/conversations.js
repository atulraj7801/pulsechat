export function conversationRepository(db) {
  return {
    transaction: (fn) => db.transaction(fn),
    lockDirectKey: (key, trx) => trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [key]),
    find: (id, trx = db) => trx('conversations').where({ id }).first(),
    lock: (id, trx) => trx('conversations').where({ id }).forUpdate().first(),
    member: (conversation_id, user_id, trx = db) =>
      trx('conversation_members').where({ conversation_id, user_id }).first(),
    members: (conversation_id, trx = db) =>
      trx('conversation_members as cm')
        .join('users as u', 'u.id', 'cm.user_id')
        .where('cm.conversation_id', conversation_id)
        .select(
          'u.id',
          'u.username',
          'u.display_name',
          'u.avatar_url',
          'u.status',
          'cm.role',
          'cm.last_read_message_id',
          'cm.last_read_at',
          'cm.muted_until',
        )
        .orderBy('cm.joined_at'),
    list: (userId) =>
      db('conversations as c')
        .leftJoin('conversation_members as cm', function () {
          this.on('c.id', '=', 'cm.conversation_id').andOnVal('cm.user_id', '=', userId);
        })
        .where((q) =>
          q.whereNotNull('cm.user_id').orWhere({ 'c.type': 'channel', 'c.is_private': false }),
        )
        .select(
          'c.*',
          'cm.role',
          'cm.last_read_message_id',
          db.raw('cm.user_id IS NOT NULL as is_member'),
          db.raw(
            `(SELECT count(*)::int FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.deleted_at IS NULL AND cm.user_id IS NOT NULL AND (cm.last_read_at IS NULL OR (m.created_at,m.id) > (cm.last_read_at, cm.last_read_message_id))) as unread_count`,
            [userId],
          ),
        )
        .orderBy('c.updated_at', 'desc'),
    create: (data, trx) =>
      trx('conversations')
        .insert(data)
        .returning('*')
        .then((r) => r[0]),
    addMembers: (rows, trx = db) =>
      trx('conversation_members').insert(rows).onConflict(['conversation_id', 'user_id']).ignore(),
    removeMember: (conversation_id, user_id, trx = db) =>
      trx('conversation_members').where({ conversation_id, user_id }).delete(),
    update: (id, data, trx = db) =>
      trx('conversations')
        .where({ id })
        .update({ ...data, updated_at: new Date() })
        .returning('*')
        .then((r) => r[0]),
    delete: (id, trx) => trx('conversations').where({ id }).delete(),
    direct: (direct_key, trx) => trx('conversations').where({ direct_key }).first(),
    userCount: (ids, trx) =>
      trx('users')
        .whereIn('id', ids)
        .count('* as count')
        .first()
        .then((r) => Number(r.count)),
    audit: (data, trx = db) => trx('audit_logs').insert(data),
    clearNotifications: (conversation_id, user_id, trx) =>
      trx('notifications').where({ conversation_id, user_id }).delete(),
  };
}
