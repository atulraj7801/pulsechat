export function presenceService({ redis, users, repo, io, isClosing = () => false }) {
  async function userProfile(id) {
    const key = `pulse:user:${id}`;
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
    const user = await users.findById(id);
    await redis.set(key, JSON.stringify(user), 'EX', 60);
    return user;
  }
  async function status(id) {
    const key = `pulse:presence:${id}`;
    await redis.zremrangebyscore(key, '-inf', Date.now() - 75000);
    const count = await redis.zcard(key);
    return count ? (await userProfile(id)).status : 'offline';
  }
  async function broadcast(id) {
    const state = await status(id);
    const peers = await repo.peers(id);
    if (peers.length && !isClosing())
      io.to(peers.map((p) => `user:${p}`)).emit('user:presence', { user_id: id, status: state });
  }
  return {
    status,
    async heartbeat(id, socketId) {
      const key = `pulse:presence:${id}`;
      await redis.multi().zadd(key, Date.now(), socketId).expire(key, 90).exec();
    },
    async connect(id, socketId) {
      await this.heartbeat(id, socketId);
      await broadcast(id);
    },
    async disconnect(id, socketId) {
      await redis.zrem(`pulse:presence:${id}`, socketId);
      if ((await status(id)) === 'offline') await repo.lastSeen(id);
      await broadcast(id);
    },
    async update(id, state) {
      await users.update(id, { status: state });
      await redis.del(`pulse:user:${id}`);
      await broadcast(id);
    },
    async snapshot(id) {
      const peers = await repo.peers(id);
      return Promise.all(
        peers.map(async (user_id) => ({ user_id, status: await status(user_id) })),
      );
    },
  };
}
