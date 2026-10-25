import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { setup } from './helpers.js';
let ctx, owner, member, outsider, channel, messageId, refreshCookie;
const password = 'A-strong-test-password!';
const auth = (token) => ({ Authorization: `Bearer ${token}` });
beforeAll(async () => {
  ctx = await setup();
}, 30000);
afterAll(async () => {
  await ctx?.close();
});
describe('real PostgreSQL and Redis API contracts', () => {
  it('reports liveness and dependency readiness', async () => {
    expect((await request(ctx.app).get('/health')).status).toBe(200);
    expect((await request(ctx.app).get('/ready')).status).toBe(200);
  });
  it('registers and hashes passwords without exposing hashes', async () => {
    for (const name of ['owner', 'member', 'outsider']) {
      const r = await request(ctx.app)
        .post('/api/auth/register')
        .send({ email: `${name}@test.example`, username: name, display_name: name, password });
      expect(r.status).toBe(201);
      expect(r.body.user.password_hash).toBeUndefined();
      if (name === 'owner') {
        owner = r.body;
        refreshCookie = r.headers['set-cookie'][0].split(';')[0];
      }
      if (name === 'member') member = r.body;
      if (name === 'outsider') outsider = r.body;
    }
    const saved = await ctx.db('users').where({ id: owner.user.id }).first();
    expect(saved.password_hash).toMatch(/^\$2[ab]\$12\$/);
    expect(saved.password_hash).not.toBe(password);
  });
  it('hides application tables from a non-owner direct database role', async () => {
    const role = `pulsechat_probe_${randomUUID().replaceAll('-', '')}`;
    const rollback = new Error('Roll back temporary role and grants');
    await expect(
      ctx.db.transaction(async (trx) => {
        await trx.raw('CREATE ROLE ?? NOLOGIN', [role]);
        await trx.raw('GRANT USAGE ON SCHEMA public TO ??', [role]);
        await trx.raw('GRANT SELECT ON users, refresh_tokens, messages TO ??', [role]);
        await trx.raw('SET LOCAL ROLE ??', [role]);
        expect(await trx('users').select('id')).toEqual([]);
        expect(await trx('refresh_tokens').select('id')).toEqual([]);
        expect(await trx('messages').select('id')).toEqual([]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);
    expect((await ctx.db('users').count('* as count').first()).count).toBe('3');
  });
  it('rejects duplicate registration, invalid bodies, and invalid authentication', async () => {
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/register')
          .send({ email: 'owner@test.example', username: 'owner', display_name: 'owner', password })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/login')
          .send({ email: 'owner@test.example', password: 'wrong' })
      ).status,
    ).toBe(401);
    expect((await request(ctx.app).get('/api/conversations').set(auth('invalid'))).status).toBe(
      401,
    );
    expect(
      (await request(ctx.app).post('/api/auth/register').send({ email: 'invalid' })).status,
    ).toBe(400);
  });
  it('logs in, rotates refresh cookies, and revokes a family on replay', async () => {
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'owner@test.example', password });
    expect(login.status).toBe(200);
    const fresh = await request(ctx.app).post('/api/auth/refresh').set('Cookie', refreshCookie);
    expect(fresh.status).toBe(200);
    const rotated = fresh.headers['set-cookie'][0].split(';')[0];
    expect(rotated).not.toBe(refreshCookie);
    expect(
      (await request(ctx.app).post('/api/auth/refresh').set('Cookie', refreshCookie)).status,
    ).toBe(401);
    expect((await request(ctx.app).post('/api/auth/refresh').set('Cookie', rotated)).status).toBe(
      401,
    );
    owner = login.body;
    refreshCookie = login.headers['set-cookie'][0].split(';')[0];
  });
  it('creates a private channel and enforces membership', async () => {
    const r = await request(ctx.app)
      .post('/api/conversations')
      .set(auth(owner.access_token))
      .send({
        type: 'channel',
        name: 'private-team',
        is_private: true,
        member_ids: [member.user.id],
      });
    expect(r.status).toBe(201);
    channel = r.body.conversation;
    expect(
      (
        await request(ctx.app)
          .get(`/api/conversations/${channel.id}`)
          .set(auth(outsider.access_token))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(ctx.app)
          .get(`/api/conversations/${channel.id}/messages`)
          .set(auth(outsider.access_token))
      ).status,
    ).toBe(403);
    expect(
      (
        await request(ctx.app)
          .patch(`/api/conversations/${channel.id}`)
          .set(auth(member.access_token))
          .send({ name: 'hijacked' })
      ).status,
    ).toBe(403);
    expect(
      (await request(ctx.app).get('/api/conversations/not-a-uuid').set(auth(owner.access_token)))
        .status,
    ).toBe(400);
  });
  it('persists messages and deduplicates concurrent retries', async () => {
    const body = { body: 'Architecture launch notes', client_message_id: randomUUID() };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        request(ctx.app)
          .post(`/api/conversations/${channel.id}/messages`)
          .set(auth(owner.access_token))
          .send(body),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.message.id)).size).toBe(1);
    messageId = results[0].body.message.id;
    expect(
      Number(
        (
          await ctx
            .db('messages')
            .where({ client_message_id: body.client_message_id })
            .count('* as count')
            .first()
        ).count,
      ),
    ).toBe(1);
    expect(
      (
        await request(ctx.app)
          .post(`/api/conversations/${channel.id}/messages`)
          .set(auth(outsider.access_token))
          .send({ body: 'attack', client_message_id: randomUUID() })
      ).status,
    ).toBe(403);
  });
  it('paginates stable cursor history without duplicate or missing rows', async () => {
    for (let i = 0; i < 5; i++)
      await request(ctx.app)
        .post(`/api/conversations/${channel.id}/messages`)
        .set(auth(owner.access_token))
        .send({ body: `Note ${i}`, client_message_id: randomUUID() });
    const all = [];
    let cursor;
    do {
      const r = await request(ctx.app)
        .get(
          `/api/conversations/${channel.id}/messages?limit=2${cursor ? `&before=${cursor}` : ''}`,
        )
        .set(auth(member.access_token));
      expect(r.status).toBe(200);
      all.push(...r.body.messages);
      cursor = r.body.next_cursor;
    } while (cursor);
    expect(all).toHaveLength(6);
    expect(new Set(all.map((m) => m.id)).size).toBe(6);
    expect(
      (
        await request(ctx.app)
          .get(`/api/conversations/${channel.id}/messages?before=garbage`)
          .set(auth(member.access_token))
      ).status,
    ).toBe(400);
  });
  it('enforces edit ownership, supports reactions, read receipts and scoped search', async () => {
    expect(
      (
        await request(ctx.app)
          .patch(`/api/messages/${messageId}`)
          .set(auth(member.access_token))
          .send({ body: 'stolen' })
      ).status,
    ).toBe(403);
    const edited = await request(ctx.app)
      .patch(`/api/messages/${messageId}`)
      .set(auth(owner.access_token))
      .send({ body: 'Architecture launch checklist' });
    expect(edited.body.message.edited_at).toBeTruthy();
    for (let i = 0; i < 2; i++)
      expect(
        (
          await request(ctx.app)
            .post(`/api/messages/${messageId}/reactions`)
            .set(auth(member.access_token))
            .send({ emoji: '🎉' })
        ).status,
      ).toBe(200);
    expect(await ctx.db('message_reactions').where({ message_id: messageId })).toHaveLength(1);
    expect(
      (
        await request(ctx.app)
          .delete(`/api/messages/${messageId}/reactions/${encodeURIComponent('🎉')}`)
          .set(auth(member.access_token))
      ).body.message.reactions,
    ).toHaveLength(0);
    expect(
      (
        await request(ctx.app)
          .post(`/api/messages/${messageId}/read`)
          .set(auth(member.access_token))
      ).status,
    ).toBe(200);
    expect(
      (
        await request(ctx.app)
          .get('/api/search/messages?q=architecture')
          .set(auth(member.access_token))
      ).body.messages,
    ).toHaveLength(1);
    expect(
      (
        await request(ctx.app)
          .get('/api/search/messages?q=architecture')
          .set(auth(outsider.access_token))
      ).body.messages,
    ).toHaveLength(0);
    expect(
      (await request(ctx.app).delete(`/api/messages/${messageId}`).set(auth(owner.access_token)))
        .status,
    ).toBe(204);
    const deleted = await ctx.db('messages').where({ id: messageId }).first();
    expect(deleted.body).toBe('');
    expect(deleted.deleted_at).toBeTruthy();
  });
  it('rejects untrusted origins and revokes access on logout', async () => {
    expect(
      (
        await request(ctx.app)
          .post('/api/auth/refresh')
          .set('Origin', 'https://evil.example')
          .set('Cookie', refreshCookie)
      ).status,
    ).toBe(403);
    expect(
      (await request(ctx.app).post('/api/auth/logout').set('Cookie', refreshCookie)).status,
    ).toBe(204);
    expect((await request(ctx.app).get('/api/auth/me').set(auth(owner.access_token))).status).toBe(
      401,
    );
  });
  it('enforces shared Redis authentication rate limits', async () => {
    const results = [];
    for (let i = 0; i < 35; i++)
      results.push((await request(ctx.app).post('/api/auth/login').send({})).status);
    expect(results).toContain(429);
  });
});
