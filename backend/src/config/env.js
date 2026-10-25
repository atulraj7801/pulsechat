import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
export function parseEnv(input) {
  return z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      PORT: z.coerce.number().int().min(1).max(65535).default(4000),
      DATABASE_URL: z.string().url(),
      REDIS_URL: z.string().url(),
      JWT_SECRET: z.string().min(32),
      UPLOAD_SECRET: z.string().min(32),
      CORS_ORIGIN: z
        .string()
        .default('http://localhost:5173')
        .refine(
          (value) =>
            value.split(',').every((origin) => {
              try {
                const url = new URL(origin.trim());
                return ['http:', 'https:'].includes(url.protocol) && url.origin === origin.trim();
              } catch {
                return false;
              }
            }),
          'Use comma-separated exact HTTP(S) origins without paths.',
        ),
      COOKIE_SECURE: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
      TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
      UPLOAD_DIR: z.string().default('./uploads'),
      SERVE_FRONTEND: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
      STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
      SUPABASE_URL: z.string().url().startsWith('https://').optional(),
      SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
      SUPABASE_STORAGE_BUCKET: z
        .string()
        .regex(/^[a-z0-9-]+$/)
        .default('pulsechat-files'),
      LOG_LEVEL: z.string().default('info'),
    })
    .superRefine((env, ctx) => {
      if (
        env.STORAGE_DRIVER === 'supabase' &&
        (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
      )
        ctx.addIssue({
          code: 'custom',
          path: ['STORAGE_DRIVER'],
          message: 'Supabase storage requires its project URL and server-only service role key.',
        });
      if (env.JWT_SECRET === env.UPLOAD_SECRET)
        ctx.addIssue({
          code: 'custom',
          path: ['UPLOAD_SECRET'],
          message: 'Use independent signing secrets.',
        });
      if (
        env.NODE_ENV === 'production' &&
        [env.JWT_SECRET, env.UPLOAD_SECRET].some((secret) => secret.startsWith('replace-with-'))
      )
        ctx.addIssue({
          code: 'custom',
          path: ['JWT_SECRET'],
          message: 'Generate real signing secrets with npm run setup.',
        });
    })
    .parse(input);
}
