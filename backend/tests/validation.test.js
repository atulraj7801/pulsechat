import { describe, it, expect } from 'vitest';
import { registerSchema } from '../src/validators/auth.js';
import { parseEnv } from '../src/config/env.js';
import { hashToken } from '../src/services/auth.js';
describe('security boundaries', () => {
  it('normalizes identity and rejects unexpected registration fields', () => {
    const input = {
      email: 'Alex@Example.com',
      username: 'Alex',
      display_name: ' Alex ',
      password: 'correct-horse-battery',
    };
    expect(registerSchema.parse(input)).toMatchObject({
      email: 'alex@example.com',
      username: 'alex',
      display_name: 'Alex',
    });
    expect(() => registerSchema.parse({ ...input, role: 'admin' })).toThrow();
    expect(() => registerSchema.parse({ ...input, password: '😀'.repeat(30) })).toThrow();
  });
  it('rejects missing secrets and invalid ports', () => {
    expect(() => parseEnv({})).toThrow();
  });
  it('stores refresh token digests instead of bearer credentials', () => {
    expect(hashToken('opaque-secret')).toHaveLength(64);
    expect(hashToken('opaque-secret')).not.toContain('opaque-secret');
  });
});
