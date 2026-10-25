import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
try {
  await access(resolve(root, '.env'));
  console.log('.env already exists; leaving it unchanged.');
} catch {
  const example = await readFile(resolve(root, '.env.example'), 'utf8');
  await writeFile(
    resolve(root, '.env'),
    example
      .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${randomBytes(48).toString('hex')}`)
      .replace(/^UPLOAD_SECRET=.*$/m, `UPLOAD_SECRET=${randomBytes(48).toString('hex')}`),
    { mode: 0o600, flag: 'wx' },
  );
  console.log('Created .env with independent random secrets.');
}
