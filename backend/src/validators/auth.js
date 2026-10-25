import { z } from 'zod';
export const registerSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_]+$/)
      .transform((v) => v.toLowerCase()),
    display_name: z.string().trim().min(1).max(80),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine((v) => Buffer.byteLength(v) <= 72, 'Password must be at most 72 bytes'),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(72),
  })
  .strict();
