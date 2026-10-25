import { Router } from 'express';
import { z } from 'zod';
import { validate, idParams } from '../middleware/validate.js';
import {
  conversationSchema,
  conversationPatch,
  messageSchema,
  messagePatch,
  reactionSchema,
  historyQuery,
  searchQuery,
  memberSchema,
  profileSchema,
} from '../validators/chat.js';
export function chatRoutes({ controller: c, guard, messageLimit, users, redis }) {
  const router = Router();
  router.use(guard);
  router.param('id', (req, _res, next) => {
    try {
      idParams.parse(req.params);
      next();
    } catch (err) {
      next(err);
    }
  });
  router.get('/conversations', c.list);
  router.post('/conversations', validate(conversationSchema), c.create);
  router.get('/conversations/:id', c.detail);
  router.patch('/conversations/:id', validate(conversationPatch), c.update);
  router.delete('/conversations/:id', c.remove);
  router.post('/conversations/:id/members', validate(memberSchema), c.addMember);
  router.delete('/conversations/:id/members/:userId', validate(idParams, 'params'), c.removeMember);
  router.get('/conversations/:id/messages', validate(historyQuery, 'query'), c.history);
  router.post('/conversations/:id/messages', messageLimit, validate(messageSchema), c.send);
  router.patch('/messages/:id', messageLimit, validate(messagePatch), c.edit);
  router.delete('/messages/:id', messageLimit, c.deleteMessage);
  router.post('/messages/:id/reactions', messageLimit, validate(reactionSchema), c.addReaction);
  router.delete(
    '/messages/:id/reactions/:emoji',
    messageLimit,
    validate(z.object({ id: z.uuid(), emoji: reactionSchema.shape.emoji }), 'params'),
    c.removeReaction,
  );
  router.post('/messages/:id/read', c.read);
  router.get('/search/messages', validate(searchQuery, 'query'), c.search);
  router.patch('/users/me', validate(profileSchema), async (req, res) => {
    const user = await users.update(req.user.id, req.validated.body);
    await redis.del(`pulse:user:${req.user.id}`);
    res.json({ user });
  });
  router.get(
    '/users/search',
    validate(z.object({ q: z.string().trim().min(2).max(80) }), 'query'),
    async (req, res) => res.json({ users: await users.search(req.validated.query.q) }),
  );
  return router;
}
