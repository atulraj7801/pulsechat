import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { setup } from './helpers.js';
let ctx, owner, other, conversationId;
beforeAll(async () => {
  ctx = await setup();
  for (const username of ['uploader', 'other']) {
    const r = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        email: `${username}@files.test`,
        username,
        display_name: username,
        password: 'Strong-file-test-password!',
      });
    if (username === 'uploader') owner = r.body;
    else other = r.body;
  }
  const r = await request(ctx.app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${owner.access_token}`)
    .send({ type: 'channel', name: 'Files', is_private: true });
  conversationId = r.body.conversation.id;
});
afterAll(async () => {
  await ctx?.close();
});
it('validates upload metadata and detects spoofed image content', async () => {
  const headers = { Authorization: `Bearer ${owner.access_token}` };
  expect(
    (
      await request(ctx.app)
        .post('/api/uploads/presigned-url')
        .set(headers)
        .send({
          conversation_id: conversationId,
          filename: '../attack',
          mime_type: 'image/svg+xml',
          size: 999999999,
        })
    ).status,
  ).toBe(400);
  const ticket = await request(ctx.app)
    .post('/api/uploads/presigned-url')
    .set(headers)
    .send({
      conversation_id: conversationId,
      filename: 'fake.png',
      mime_type: 'image/png',
      size: 10,
    });
  expect(ticket.status).toBe(200);
  const upload = await request(ctx.app)
    .put(ticket.body.upload_url)
    .set('Content-Type', 'image/png')
    .send(Buffer.from('not-an-img'));
  expect(upload.status).toBe(400);
});
it('uploads bytes, attaches atomically, and protects signed downloads', async () => {
  const headers = { Authorization: `Bearer ${owner.access_token}` },
    bytes = Buffer.from('PulseChat attachment integration test');
  const ticket = await request(ctx.app)
    .post('/api/uploads/presigned-url')
    .set(headers)
    .send({
      conversation_id: conversationId,
      filename: 'notes.txt',
      mime_type: 'text/plain',
      size: bytes.length,
    });
  await request(ctx.app)
    .put(ticket.body.upload_url)
    .set('Content-Type', 'text/plain')
    .send(bytes)
    .expect(200);
  const sent = await request(ctx.app)
    .post(`/api/conversations/${conversationId}/messages`)
    .set(headers)
    .send({
      body: '',
      client_message_id: randomUUID(),
      attachment_ids: [ticket.body.attachment_id],
    });
  expect(sent.status).toBe(201);
  expect(sent.body.message.attachments).toHaveLength(1);
  const url = await request(ctx.app)
    .get(`/api/attachments/${ticket.body.attachment_id}/download-url`)
    .set(headers);
  expect(url.status).toBe(200);
  const file = await request(ctx.app).get(url.body.url);
  expect(file.status).toBe(200);
  expect(file.text).toBe(bytes.toString());
  expect(file.headers['content-disposition']).toContain('attachment');
  expect(
    (
      await request(ctx.app)
        .get(`/api/attachments/${ticket.body.attachment_id}/download-url`)
        .set('Authorization', `Bearer ${other.access_token}`)
    ).status,
  ).toBe(403);
  await request(ctx.app).delete(`/api/messages/${sent.body.message.id}`).set(headers).expect(204);
  expect((await request(ctx.app).get(url.body.url)).status).toBe(404);
});
