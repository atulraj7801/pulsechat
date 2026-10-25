export function extrasRepository(db) {
  return {
    transaction: (fn) => db.transaction(fn),
    attachment: (id, trx = db) => trx('attachments').where({ id }).first(),
    createAttachment: (data) =>
      db('attachments')
        .insert(data)
        .returning('*')
        .then((r) => r[0]),
    lockAttachment: (id, trx) => trx('attachments').where({ id }).forUpdate().first(),
    uploaded: (id, trx) => trx('attachments').where({ id }).update({ uploaded_at: new Date() }),
    notifications: (userId) =>
      db('notifications as n')
        .join('conversation_members as cm', function () {
          this.on('cm.conversation_id', 'n.conversation_id').andOn('cm.user_id', 'n.user_id');
        })
        .where('n.user_id', userId)
        .select('n.*')
        .orderBy('n.created_at', 'desc')
        .limit(100),
    readNotifications: (user_id) =>
      db('notifications').where({ user_id }).whereNull('read_at').update({ read_at: new Date() }),
    pins: (id) =>
      db('messages')
        .where({ conversation_id: id, is_pinned: true })
        .whereNull('deleted_at')
        .orderBy('created_at', 'desc')
        .limit(50),
    files: (id) =>
      db('attachments as a')
        .join('messages as m', 'm.id', 'a.message_id')
        .where('a.conversation_id', id)
        .whereNull('m.deleted_at')
        .select('a.id', 'a.filename', 'a.mime_type', 'a.size', 'a.created_at')
        .orderBy('a.created_at', 'desc')
        .limit(50),
    message: (id) => db('messages').where({ id }).first(),
    mute: (conversation_id, user_id, muted_until) =>
      db('conversation_members').where({ conversation_id, user_id }).update({ muted_until }),
  };
}
