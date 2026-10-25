// All callers invoke this boundary only after their transaction commits.
export function eventService({ logger, repo }) {
  let io;
  return {
    attach: (server) => {
      io = server;
    },
    revokeSession: (id) => io?.in(`session:${id}`).disconnectSockets(true),
    async message(event, message, notifications = []) {
      const members = await repo.members(message.conversation_id);
      if (members.length) io?.to(members.map((m) => `user:${m.id}`)).emit(event, message);
      for (const notification of notifications.filter(n => members.some(m => m.id === n.user_id)))
        io?.to(`user:${notification.user_id}`).emit('notification:new', notification);
    },
    async read(receipt) {
      const members = await repo.members(receipt.conversation_id);
      if (members.length) io?.to(members.map((m) => `user:${m.id}`)).emit('message:read', receipt);
    },
    async conversation(id, userIds = []) {
      const members = await repo.members(id);
      const ids = [...new Set([...members.map((m) => m.id), ...userIds])];
      if (ids.length)
        io?.to(ids.map((userId) => `user:${userId}`)).emit('conversation:updated', { id });
    },
    async kick(id, userId) {
      if (io) {
        try {
          const sockets = await io.in(`user:${userId}`).fetchSockets();
          for (const socket of sockets) await socket.leave(`conversation:${id}`);
        } catch {
          logger.warn(
            'Could not evict remote socket; authorization remains enforced on incoming events',
          );
        }
      }
    },
    async removed(id, userIds) {
      for (const userId of userIds) {
        await this.kick(id, userId);
        io?.to(`user:${userId}`).emit('conversation:updated', { id, deleted: true });
      }
    },
  };
}
