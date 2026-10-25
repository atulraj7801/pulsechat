import { Router, raw } from 'express';
import { z } from 'zod';
import { validate, idParams } from '../middleware/validate.js';
const ticketSchema = z
  .object({ ticket: z.string().min(1).max(2048), inline: z.literal('1').optional() })
  .strict();
// Disallow control characters in filenames.
const uploadSchema = z
  .object({
    conversation_id: z.uuid(),
    filename: z
      .string()
      .min(1)
      .max(180)
      // eslint-disable-next-line no-control-regex
      .regex(/^[^/\\\x00-\x1f\x7f]+$/),
    mime_type: z.enum([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
    ]),
    size: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
  })
  .strict();
export function extrasRoutes({ guard, uploads, conversations, repo, messagesRepo, uploadLimit }) {
  const router = Router();
  router.post(
    '/uploads/presigned-url',
    guard,
    uploadLimit,
    validate(uploadSchema),
    async (req, res) => res.json(await uploads.presign(req.user.id, req.validated.body)),
  );
  router.put(
    '/uploads/:id',
    uploadLimit,
    validate(idParams, 'params'),
    validate(ticketSchema, 'query'),
    raw({ type: () => true, limit: '10mb' }),
    async (req, res) =>
      res.json(await uploads.upload(req.params.id, req.validated.query.ticket, req.body)),
  );
  router.get(
    '/attachments/:id/download-url',
    guard,
    validate(idParams, 'params'),
    async (req, res) => res.json(await uploads.downloadUrl(req.params.id, req.user.id)),
  );
  router.get(
    '/files/:id',
    validate(idParams, 'params'),
    validate(ticketSchema, 'query'),
    async (req, res) => {
      const file = await uploads.download(req.params.id, req.validated.query.ticket);
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
      if (req.validated.query.inline && file.mime_type.startsWith('image/')) {
        return res.type(file.mime_type).send(file.bytes);
      }
      res.attachment(file.filename).type(file.mime_type).send(file.bytes);
    },
  );
  router.get('/notifications', guard, async (req, res) =>
    res.json({ notifications: await repo.notifications(req.user.id) }),
  );
  router.post('/notifications/read', guard, async (req, res) => {
    await repo.readNotifications(req.user.id);
    res.status(204).end();
  });
  router.get(
    '/conversations/:id/details',
    guard,
    validate(idParams, 'params'),
    async (req, res) => {
      await conversations.membership(req.params.id, req.user.id);
      const [pins, files] = await Promise.all([
        repo.pins(req.params.id),
        repo.files(req.params.id),
      ]);
      res.json({ pins: await messagesRepo.hydrate(pins), files });
    },
  );
  router.patch(
    '/conversations/:id/preferences',
    guard,
    validate(idParams, 'params'),
    validate(z.object({ muted_until: z.iso.datetime().nullable() }).strict()),
    async (req, res) => {
      await conversations.membership(req.params.id, req.user.id);
      await repo.mute(req.params.id, req.user.id, req.validated.body.muted_until);
      res.status(204).end();
    },
  );
  return router;
}
