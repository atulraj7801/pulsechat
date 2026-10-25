import { decodeCursor, encodeCursor } from '../utils/cursor.js';
export function messageRepository(db) {
  async function hydrate(rows, trx = db) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [senders, reactions, attachments, replies] = await Promise.all([
      trx('users')
        .whereIn('id', [...new Set(rows.map((r) => r.sender_id))])
        .select('id', 'display_name', 'username', 'avatar_url', 'status'),
      trx('message_reactions').whereIn('message_id', ids),
      trx('attachments')
        .whereIn('message_id', ids)
        .select('id', 'message_id', 'filename', 'mime_type', 'size'),
      trx('messages as m')
        .join('users as u', 'u.id', 'm.sender_id')
        .whereIn('m.id', rows.map((r) => r.reply_to_id).filter(Boolean))
        .select('m.id', 'm.body', 'm.deleted_at', 'u.display_name'),
    ]);
    return rows.map((row) => ({
      ...row,
      body: row.deleted_at ? '' : row.body,
      sender: senders.find((u) => u.id === row.sender_id),
      reactions: row.deleted_at ? [] : reactions.filter((r) => r.message_id === row.id),
      attachments: row.deleted_at ? [] : attachments.filter((a) => a.message_id === row.id),
      reply_to: (() => {
        const reply = replies.find((r) => r.id === row.reply_to_id);
        return reply ? { ...reply, body: reply.deleted_at ? 'Message deleted' : reply.body } : null;
      })(),
    }));
  }
  return {
    transaction: (fn) => db.transaction(fn),
    lockRetryKey: (senderId, clientId, trx) => trx.raw('SELECT pg_advisory_xact_lock(hashtext(?))', [`${senderId}:${clientId}`]),
    hydrate,
    find: (id, trx = db) => trx('messages').where({ id }).first(),
    full: async (id) => (await hydrate(await db('messages').where({ id })))[0],
    duplicate: (sender_id, client_message_id, trx) =>
      trx('messages').where({ sender_id, client_message_id }).first(),
    create: (data, trx) =>
      trx('messages')
        .insert(data)
        .returning('*')
        .then((r) => r[0]),
    update: (id, data, trx = db) =>
      trx('messages')
        .where({ id })
        .update({ ...data, updated_at: new Date(), version: trx.raw('version + 1') }),
    async history(conversation_id, { before, limit }) {
      const query = db('messages')
        .where({ conversation_id })
        .orderBy([
          { column: 'created_at', order: 'desc' },
          { column: 'id', order: 'desc' },
        ])
        .limit(limit + 1);
      if (before) {
        const cursor = decodeCursor(before);
        query.whereRaw('(created_at, id) < (?, ?::uuid)', [cursor.at, cursor.id]);
      }
      const rows = await query;
      const hasMore = rows.length > limit;
      rows.splice(limit);
      return {
        messages: await hydrate(rows.reverse()),
        next_cursor: hasMore ? encodeCursor(rows[0]) : null,
      };
    },
    lockConversation: (id, trx) => trx('conversations').where({ id }).forUpdate().first(),
    lockMessage: (id, trx) => trx('messages').where({ id }).forUpdate().first(),
    attachmentRows: (ids, trx) => trx('attachments').whereIn('id', ids).forUpdate(),
    attach: (ids, message_id, trx) => trx('attachments').whereIn('id', ids).update({ message_id }),
    touchConversation: (id, trx) =>
      trx('conversations').where({ id }).update({ updated_at: new Date() }),
    notify: async (message, trx) => {
      const others = await trx('conversation_members')
        .where('conversation_id', message.conversation_id)
        .whereNot('user_id', message.sender_id)
        .where((q) => q.whereNull('muted_until').orWhere('muted_until', '<', new Date()));
      if (!others.length) return [];
      const sender = await trx('users').where({ id: message.sender_id }).first('display_name');
      return trx('notifications')
        .insert(
          others.map((m) => ({
            user_id: m.user_id,
            conversation_id: message.conversation_id,
            message_id: message.id,
            title: `${sender.display_name} sent a message`,
          })),
        )
        .returning('*');
    },
    reaction: (message_id, user_id, emoji, add, trx) =>
      add
        ? trx('message_reactions')
            .insert({ message_id, user_id, emoji })
            .onConflict(['message_id', 'user_id', 'emoji'])
            .ignore()
        : trx('message_reactions').where({ message_id, user_id, emoji }).delete(),
    async read(message, user_id, trx) {
      const member = await trx('conversation_members')
        .where({ conversation_id: message.conversation_id, user_id })
        .forUpdate()
        .first();
      const previous = member.last_read_message_id
        ? await trx('messages').where({ id: member.last_read_message_id }).first()
        : null;
      if (
        previous &&
        (new Date(previous.created_at) > new Date(message.created_at) ||
          (+new Date(previous.created_at) === +new Date(message.created_at) &&
            previous.id >= message.id))
      )
        return false;
      await trx('conversation_members')
        .where({ conversation_id: message.conversation_id, user_id })
        .update({ last_read_message_id: message.id, last_read_at: message.created_at });
      await trx('notifications')
        .where({ conversation_id: message.conversation_id, user_id })
        .whereIn(
          'message_id',
          trx('messages')
            .select('id')
            .where({ conversation_id: message.conversation_id })
            .whereRaw('(created_at, id) <= (?, ?::uuid)', [message.created_at, message.id]),
        )
        .whereNull('read_at')
        .update({ read_at: new Date() });
      return true;
    },
    search: async (userId, { q, conversation_id }) => {
      const query = db('messages as m')
        .join('conversation_members as cm', 'cm.conversation_id', 'm.conversation_id')
        .where('cm.user_id', userId)
        .whereNull('m.deleted_at')
        .whereRaw("to_tsvector('english', m.body) @@ websearch_to_tsquery('english', ?)", [q])
        .select('m.*')
        .orderBy('m.created_at', 'desc')
        .limit(50);
      if (conversation_id) query.where('m.conversation_id', conversation_id);
      return hydrate(await query);
    },
    audit: (data, trx) => trx('audit_logs').insert(data),
  };
}
