import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from 'node:http';
import { io as client } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { setup } from './helpers.js';
import { attachSockets } from '../src/sockets/index.js';
import { createApp } from '../src/app.js';
let ctx,
  serverA,
  serverB,
  socketServerA,
  socketServerB,
  urlA,
  urlB,
  alice,
  bob,
  eve,
  channel,
  sent,
  aliceSocket,
  bobSocket;
const clients = [];
const once = (socket, event, timeout = 4000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, done);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeout);
    function done(data) {
      clearTimeout(timer);
      resolve(data);
    }
    socket.once(event, done);
  });
const emit = (socket, event, data) =>
  new Promise((resolve, reject) =>
    socket.timeout(4000).emit(event, data, (err, result) => (err ? reject(err) : resolve(result))),
  );
async function connect(token, url = urlA) {
  const socket = client(url, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    autoConnect: false,
  });
  clients.push(socket);
  const connected = once(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}
beforeAll(async () => {
  ctx = await setup();
  for (const name of ['alice', 'bob', 'eve']) {
    const r = await request(ctx.app)
      .post('/api/auth/register')
      .send({
        email: `${name}@socket.test`,
        username: name,
        display_name: name,
        password: 'Strong-socket-test-password!',
      });
    expect(r.status).toBe(201);
    if (name === 'alice') alice = { ...r.body, cookie: r.headers['set-cookie'][0].split(';')[0] };
    if (name === 'bob') bob = r.body;
    if (name === 'eve') eve = r.body;
  }
  const c = await request(ctx.app)
    .post('/api/conversations')
    .set('Authorization', `Bearer ${alice.access_token}`)
    .send({ type: 'group', name: 'realtime', is_private: true, member_ids: [bob.user.id] });
  channel = c.body.conversation;
  serverA = createServer(ctx.app);
  socketServerA = await attachSockets(serverA, { ...ctx, services: ctx.app.locals.services });
  await new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve));
  urlA = `http://127.0.0.1:${serverA.address().port}`;
  const appB = createApp(ctx);
  appB.locals.finalize();
  serverB = createServer(appB);
  socketServerB = await attachSockets(serverB, { ...ctx, services: appB.locals.services });
  await new Promise((resolve) => serverB.listen(0, '127.0.0.1', resolve));
  urlB = `http://127.0.0.1:${serverB.address().port}`;
}, 30000);
afterAll(async () => {
  for (const socket of clients) socket.disconnect();
  await socketServerA?.close();
  await socketServerB?.close();
  await ctx?.close();
});
describe('Socket.IO across two real Redis-adapter nodes', () => {
  it('does not broadcast typing globally when a conversation has no other recipients', async () => {
    const a = await connect(alice.access_token), e = await connect(eve.access_token, urlB);
    const created = await request(ctx.app).post('/api/conversations').set('Authorization', `Bearer ${alice.access_token}`).send({ type: 'channel', name: 'Only me', is_private: true });
    const received = []; e.on('user:typing', event => received.push(event));
    expect((await emit(a, 'message:typing:start', { conversation_id: created.body.conversation.id })).ok).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 100)); expect(received).toHaveLength(0); a.disconnect(); e.disconnect();
  });
  it('rejects unauthenticated handshakes', async () => {
    const socket = client(urlA, {
      auth: { token: 'invalid' },
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
    });
    clients.push(socket);
    const rejected = once(socket, 'connect_error');
    socket.connect();
    expect((await rejected).message).toBe('UNAUTHORIZED');
  });
  it('checks membership before room entry and rejects supplied user IDs', async () => {
    aliceSocket = await connect(alice.access_token);
    bobSocket = await connect(bob.access_token, urlB);
    const outsider = await connect(eve.access_token);
    expect((await emit(aliceSocket, 'conversation:join', { conversation_id: channel.id })).ok).toBe(
      true,
    );
    expect((await emit(bobSocket, 'conversation:join', { conversation_id: channel.id })).ok).toBe(
      true,
    );
    expect(
      (await emit(outsider, 'conversation:join', { conversation_id: channel.id })).error.code,
    ).toBe('FORBIDDEN');
    expect(
      (
        await emit(outsider, 'message:send', {
          conversation_id: channel.id,
          body: 'spoof',
          client_message_id: randomUUID(),
          user_id: alice.user.id,
        })
      ).error.code,
    ).toBe('VALIDATION_ERROR');
  });
  it('persists before cross-instance broadcast and acknowledges idempotent retries', async () => {
    const payload = {
      conversation_id: channel.id,
      body: 'Across nodes',
      client_message_id: randomUUID(),
    };
    const incoming = once(bobSocket, 'message:new');
    const ack = await emit(aliceSocket, 'message:send', payload);
    expect(ack.ok).toBe(true);
    sent = await incoming;
    expect(sent.id).toBe(ack.message.id);
    expect(await ctx.db('messages').where({ id: sent.id }).first()).toBeTruthy();
    const retry = await emit(aliceSocket, 'message:send', payload);
    expect(retry.duplicate).toBe(true);
    expect(retry.message.id).toBe(sent.id);
  });
  it('relays typing, delivery and monotonic read receipts', async () => {
    const typing = once(aliceSocket, 'user:typing');
    await emit(bobSocket, 'message:typing:start', { conversation_id: channel.id });
    expect((await typing).user_id).toBe(bob.user.id);
    const delivery = once(aliceSocket, 'message:delivered');
    await emit(bobSocket, 'message:delivered', { message_id: sent.id });
    expect((await delivery).message_id).toBe(sent.id);
    const receipt = once(aliceSocket, 'message:read');
    expect((await emit(bobSocket, 'message:read', { message_id: sent.id })).ok).toBe(true);
    expect((await receipt).user_id).toBe(bob.user.id);
  });
  it('recovers missed messages by refetching durable history after reconnect', async () => {
    bobSocket.disconnect();
    const missed = await emit(aliceSocket, 'message:send', {
      conversation_id: channel.id,
      body: 'While you were away',
      client_message_id: randomUUID(),
    });
    const connected = once(bobSocket, 'connect');
    bobSocket.connect();
    await connected;
    expect((await emit(bobSocket, 'conversation:join', { conversation_id: channel.id })).ok).toBe(
      true,
    );
    const history = await request(ctx.app)
      .get(`/api/conversations/${channel.id}/messages`)
      .set('Authorization', `Bearer ${bob.access_token}`);
    expect(history.body.messages.some((m) => m.id === missed.message.id)).toBe(true);
  });
  it('blocks removed members on existing sockets and excludes them from future broadcasts', async () => {
    await request(ctx.app)
      .delete(`/api/conversations/${channel.id}/members/${bob.user.id}`)
      .set('Authorization', `Bearer ${alice.access_token}`)
      .expect(204);
    expect(
      (
        await emit(bobSocket, 'message:send', {
          conversation_id: channel.id,
          body: 'no access',
          client_message_id: randomUUID(),
        })
      ).error.code,
    ).toBe('FORBIDDEN');
    const received = [];
    bobSocket.on('message:new', (m) => received.push(m));
    await emit(aliceSocket, 'message:send', {
      conversation_id: channel.id,
      body: 'members only',
      client_message_id: randomUUID(),
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(received).toHaveLength(0);
  });
  it('disconnects live sockets when the session logs out', async () => {
    const disconnected = once(aliceSocket, 'disconnect');
    await request(ctx.app).post('/api/auth/logout').set('Cookie', alice.cookie).expect(204);
    expect(await disconnected).toBe('io server disconnect');
  });
});
