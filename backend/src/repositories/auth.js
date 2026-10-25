export function authRepository(db) {
  return {
    transaction: (fn) => db.transaction(fn),
    createSession: (data, trx = db) =>
      trx('user_sessions')
        .insert(data)
        .returning('*')
        .then((rows) => rows[0]),
    createToken: (data, trx = db) => trx('refresh_tokens').insert(data),
    findToken: (hash, trx = db) =>
      trx('refresh_tokens').where({ token_hash: hash }).forUpdate().first(),
    useToken: (id, trx) => trx('refresh_tokens').where({ id }).update({ used_at: new Date() }),
    session: (id, trx = db) => trx('user_sessions').where({ id }).first(),
    revoke: (id, trx = db) => trx('user_sessions').where({ id }).update({ revoked_at: new Date() }),
    audit: (user_id, action, resource_id = null, trx = db) =>
      trx('audit_logs').insert({ user_id, action, resource_id }),
    joinWelcome: async (user_id, trx) => {
      const channel = await trx('conversations')
        .where({ slug: 'general', is_private: false })
        .first();
      if (channel)
        await trx('conversation_members').insert({ conversation_id: channel.id, user_id });
    },
  };
}
