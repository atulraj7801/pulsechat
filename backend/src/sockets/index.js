import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { z } from 'zod';
import { messageSchema, reactionSchema } from '../validators/chat.js';
import { AppError, assert } from '../utils/errors.js';
import { presenceRepository } from '../repositories/presence.js';
import { presenceService } from '../services/presence.js';
import { messageRepository } from '../repositories/messages.js';
const roomSchema = z.object({ conversation_id: z.uuid() }).strict();
const messageIdSchema = z.object({ message_id: z.uuid() }).strict();
export async function attachSockets(server, { services, db, redis, env, logger }) {
  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
  const io = new Server(server, {
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 32768,
    allowRequest: (req, callback) =>
      callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
  });
  const pub = redis.duplicate({ lazyConnect: true }),
    sub = redis.duplicate({ lazyConnect: true });
  await Promise.all([pub.connect(), sub.connect()]);
  io.adapter(createAdapter(pub, sub));
  services.events.attach(io);
  let shuttingDown = false;
  const pending = new Set();
  function background(task) {
    const safe = task.catch(() => logger.warn('Presence operation deferred to expiry'));
    pending.add(safe);
    safe.then(() => pending.delete(safe));
  }
  const presence = presenceService({
    redis,
    users: services.users,
    repo: presenceRepository(db),
    io,
    isClosing: () => shuttingDown,
  });
  const presenceRepo = presenceRepository(db), messageRepo = messageRepository(db);
  io.use(async (socket, next) => {
    try {
      socket.data.user = await services.authentication.authenticate(
        socket.handshake.auth?.token || '',
      );
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });
  io.on('connection', (socket) => {
    const userId = socket.data.user.id;
    socket.join(`user:${userId}`);
    socket.join(`session:${socket.data.user.sessionId}`);
    const expire = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, socket.data.user.expiresAt - Date.now()),
    ).unref();
    const beat = setInterval(
      () => background(presence.heartbeat(userId, socket.id).then(() => presence.snapshot(userId)).then(snapshot => socket.emit('presence:snapshot', snapshot)).catch(() => socket.disconnect(true))),
      25000,
    ).unref();
    background(
      presence
        .connect(userId, socket.id)
        .then(() => presence.snapshot(userId))
        .then((snapshot) => socket.emit('presence:snapshot', snapshot))
        .catch(() => socket.disconnect(true)),
    );
    function on(name, schema, handler, limit = 120) {
      socket.on(name, async (input, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          await services.authentication.authenticate(socket.handshake.auth.token);
          const count = await redis.eval(
            "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],60000) end; return n",
            1,
            `pulse:socket-limit:${userId}:${name}`,
          );
          assert(count <= limit, 429, 'RATE_LIMITED', 'Please slow down and try again.');
          const result = await handler(schema.parse(input));
          reply({ ok: true, ...result });
        } catch (err) {
          if (!(err instanceof AppError) && !(err instanceof z.ZodError))
            logger.error({ event: name, errorType: err.name }, 'Socket event failed');
          reply({
            ok: false,
            error: {
              code: err.code || (err instanceof z.ZodError ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR'),
              message: err instanceof AppError ? err.message : 'Could not process this event.',
            },
          });
        }
      });
    }
    on('conversation:join', roomSchema, async ({ conversation_id }) => {
      await services.conversations.membership(conversation_id, userId);
      await socket.join(`conversation:${conversation_id}`); // Recheck after join to close a concurrent removal window.
      try {
        await services.conversations.membership(conversation_id, userId);
      } catch (err) {
        await socket.leave(`conversation:${conversation_id}`);
        throw err;
      }
      return { conversation_id };
    });
    on('conversation:leave', roomSchema, async ({ conversation_id }) => {
      await socket.leave(`conversation:${conversation_id}`);
    });
    on(
      'message:send',
      messageSchema.safeExtend({ conversation_id: z.uuid() }),
      async ({ conversation_id, ...message }) =>
        services.messages.send(conversation_id, userId, message),
      60,
    );
    for (const typing of [true, false])
      on(
        `message:typing:${typing ? 'start' : 'stop'}`,
        roomSchema,
        async ({ conversation_id }) => {
          await services.conversations.membership(conversation_id, userId);
          const user = await services.users.findById(userId);
          const members = await presenceRepo.members(conversation_id);
          const recipients = members.filter((m) => m.user_id !== userId).map((m) => `user:${m.user_id}`);
          if (recipients.length) io.to(recipients).emit(
            'user:typing',
            {
              conversation_id,
              user_id: userId,
              display_name: user.display_name,
              typing,
              expires_at: Date.now() + 4000,
            },
          );
        },
        80,
      );
    on('message:read', messageIdSchema, ({ message_id }) =>
      services.messages.read(message_id, userId),
    );
    on('message:delivered', messageIdSchema, async ({ message_id }) => {
      const message = await messageRepo.find(message_id);
      assert(message, 404, 'NOT_FOUND', 'Message not found.');
      await services.conversations.membership(message.conversation_id, userId);
      if (message.sender_id !== userId)
        io.to(`user:${message.sender_id}`).emit('message:delivered', {
          message_id,
          conversation_id: message.conversation_id,
          user_id: userId,
        });
    });
    for (const add of [true, false])
      on(
        `message:reaction:${add ? 'add' : 'remove'}`,
        reactionSchema.extend({ message_id: z.uuid() }),
        async ({ message_id, emoji }) => ({
          message: await services.messages.reaction(message_id, userId, emoji, add),
        }),
        60,
      );
    on(
      'presence:update',
      z.object({ status: z.enum(['online', 'away', 'busy', 'offline']) }).strict(),
      async ({ status }) => {
        await presence.update(userId, status);
      },
      20,
    );
    socket.on('disconnect', () => {
      clearTimeout(expire);
      clearInterval(beat);
      background(presence.disconnect(userId, socket.id));
    });
  });
  return {
    io,
    close: async () => {
      shuttingDown = true;
      await new Promise((resolve) => io.close(resolve));
      await Promise.all([...pending]);
      await Promise.all([pub.quit(), sub.quit()]);
    },
  };
}
