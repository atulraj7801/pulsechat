import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { createFileStorage } from '../src/services/file-storage.js';
import { mountFrontend } from '../src/middleware/frontend.js';
import { parseEnv } from '../src/config/env.js';

describe('single-origin production frontend', () => {
  let directory, app;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pulsechat-dist-'));
    await mkdir(join(directory, 'assets'));
    await writeFile(join(directory, 'index.html'), '<html>PulseChat</html>');
    await writeFile(join(directory, 'assets/app.js'), 'window.pulse=true;');
    app = express();
    mountFrontend(app, directory);
    app.use((_req, res) => res.status(404).json({ error: 'not found' }));
  });
  afterAll(() => rm(directory, { recursive: true, force: true }));
  it('serves deep links and compiled assets without swallowing API errors', async () => {
    const page = await request(app).get('/app/conversation-id').expect(200);
    expect(page.text).toContain('PulseChat');
    expect(page.headers['cache-control']).toBe('no-store');
    await request(app)
      .get('/assets/app.js')
      .expect('Content-Type', /javascript/)
      .expect(200);
    await request(app).get('/api/missing').expect('Content-Type', /json/).expect(404);
    await request(app).get('/assets/missing.js').expect(404);
    await request(app).get('/socket.io/missing').expect(404);
  });
  it('fails clearly when the production frontend was not built', () => {
    expect(() => mountFrontend(express(), join(directory, 'missing'))).toThrow(
      'Frontend build is missing',
    );
  });
});

describe('private cloud storage adapter with the real Supabase SDK', () => {
  let server, storage;
  const objects = new Map();
  const key = '12345678-1234-1234-1234-123456789abc';
  beforeAll(async () => {
    // A local HTTP contract server exercises SDK serialization and binary transfer.
    // Hosted credentials are deliberately not needed by the test suite.
    server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const path = req.url;
      if (req.headers.authorization !== 'Bearer test-server-key') {
        res.writeHead(401).end('{}');
        return;
      }
      if (path === '/storage/v1/object/list/pulsechat-files') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify(
            [...objects.keys()].map((name) => ({
              id: name,
              name,
              created_at: '2026-01-01T00:00:00Z',
            })),
          ),
        );
      } else if (req.method === 'DELETE' && path === '/storage/v1/object/pulsechat-files') {
        for (const name of JSON.parse(body).prefixes) objects.delete(name);
        res.setHeader('Content-Type', 'application/json');
        res.end('[]');
      } else if (req.method === 'POST' && path === `/storage/v1/object/pulsechat-files/${key}`) {
        if (objects.has(key)) {
          res
            .writeHead(409, { 'Content-Type': 'application/json' })
            .end('{"message":"private-provider-detail","statusCode":"409"}');
          return;
        }
        expect(req.headers['x-upsert']).toBe('false');
        objects.set(key, body);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ Key: `pulsechat-files/${key}` }));
      } else if (
        req.method === 'GET' &&
        path === `/storage/v1/object/pulsechat-files/${key}` &&
        objects.has(key)
      ) {
        res.setHeader('Content-Type', 'text/plain');
        res.end(objects.get(key));
      } else
        res
          .writeHead(404, { 'Content-Type': 'application/json' })
          .end('{"message":"private-provider-detail","statusCode":"404"}');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    storage = createFileStorage({
      STORAGE_DRIVER: 'supabase',
      SUPABASE_URL: `http://127.0.0.1:${server.address().port}`,
      SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
      SUPABASE_STORAGE_BUCKET: 'pulsechat-files',
    });
  });
  afterAll(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  it('uploads exact bytes, prevents replacement, downloads privately, lists and deletes objects', async () => {
    const bytes = Buffer.from('A persistent attachment 🌍');
    await storage.put(key, bytes, 'text/plain');
    expect(await storage.get(key)).toEqual(bytes);
    await expect(storage.put(key, Buffer.from('replacement'), 'text/plain')).rejects.toMatchObject({
      code: 'STORAGE_UNAVAILABLE',
    });
    expect(await storage.get(key)).toEqual(bytes);
    const listed = [];
    for await (const object of storage.objects()) listed.push(object);
    expect(listed).toEqual([{ key, createdAt: Date.parse('2026-01-01T00:00:00Z') }]);
    await storage.remove(key);
    expect(objects.size).toBe(0);
    await expect(storage.get(key)).rejects.toMatchObject({
      status: 503,
      code: 'STORAGE_UNAVAILABLE',
    });
  });
  it('rejects path traversal and incomplete cloud configuration', () => {
    expect(() => storage.put('../secret', Buffer.from('x'), 'text/plain')).toThrow(
      'Invalid storage key',
    );
    expect(() =>
      parseEnv({
        DATABASE_URL: 'postgres://localhost/test',
        REDIS_URL: 'redis://localhost',
        JWT_SECRET: 'a'.repeat(40),
        UPLOAD_SECRET: 'b'.repeat(40),
        STORAGE_DRIVER: 'supabase',
      }),
    ).toThrow('Supabase storage requires');
  });
});
