export function presenceRepository(db) {
  return {
    peers: (userId) =>
      db('conversation_members as mine')
        .join('conversation_members as peer', 'mine.conversation_id', 'peer.conversation_id')
        .where('mine.user_id', userId)
        .distinct('peer.user_id')
        .then((rows) => rows.map((r) => r.user_id)),
    lastSeen: (userId) => db('users').where({ id: userId }).update({ last_seen_at: new Date() }),
    members: (id) => db('conversation_members').where({ conversation_id: id }).select('user_id'),
  };
}
