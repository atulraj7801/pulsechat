import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
async function check(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (path.endsWith('.js')) execFileSync(process.execPath, ['--check', path]);
  }
}
await check(process.argv[2]);
console.log('Backend JavaScript syntax verified; native ESM requires no transpilation.');
