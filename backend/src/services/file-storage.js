import { mkdir, writeFile, readFile, unlink, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { AppError } from '../utils/errors.js';

// Objects use generated UUID names; never accept paths or filenames from a request.
const validKey = (key) => {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid storage key');
  return key;
};
export function createFileStorage(env) {
  if (env.STORAGE_DRIVER !== 'supabase') {
    const root = resolve(env.UPLOAD_DIR);
    return {
      async put(key, bytes) {
        await mkdir(root, { recursive: true });
        await writeFile(resolve(root, validKey(key)), bytes, { flag: 'wx', mode: 0o600 });
      },
      get: (key) => readFile(resolve(root, validKey(key))),
      async remove(key) {
        try {
          await unlink(resolve(root, validKey(key)));
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      },
      async *objects() {
        let keys;
        try {
          keys = await readdir(root);
        } catch (error) {
          if (error.code === 'ENOENT') return;
          throw error;
        }
        for (const key of keys) {
          if (!/^[a-f0-9-]{36}$/.test(key)) continue;
          const info = await stat(resolve(root, key)).catch(() => null);
          if (info?.isFile()) yield { key, createdAt: info.mtimeMs };
        }
      },
    };
  }
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
    },
  });
  const bucket = client.storage.from(env.SUPABASE_STORAGE_BUCKET);
  // Do not propagate provider responses, URLs, or credentials to logs or clients.
  async function result(request) {
    try {
      const { data, error } = await request;
      if (error) throw error;
      return data;
    } catch {
      throw new AppError(
        503,
        'STORAGE_UNAVAILABLE',
        'File storage is temporarily unavailable. Please try again.',
      );
    }
  }
  return {
    put: (key, bytes, mime) =>
      result(bucket.upload(validKey(key), bytes, { contentType: mime, upsert: false })),
    async get(key) {
      const blob = await result(bucket.download(validKey(key)));
      if (blob.size > 10 * 1024 * 1024)
        throw new AppError(503, 'INVALID_STORED_FILE', 'Stored file exceeds the size limit.');
      return Buffer.from(await blob.arrayBuffer());
    },
    remove: (key) => result(bucket.remove([validKey(key)])),
    async *objects() {
      for (let offset = 0; ; offset += 100) {
        const files = await result(
          bucket.list('', { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } }),
        );
        for (const file of files) {
          if (file.id && /^[a-f0-9-]{36}$/.test(file.name))
            yield { key: file.name, createdAt: Date.parse(file.created_at) };
        }
        if (files.length < 100) break;
      }
    },
  };
}
