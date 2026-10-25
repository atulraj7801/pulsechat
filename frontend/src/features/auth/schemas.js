import { z } from 'zod';
export const loginSchema = z.object({ email: z.email('Enter a valid email.'), password: z.string().min(1, 'Enter your password.') });
export const registerSchema = loginSchema.extend({ display_name: z.string().trim().min(1, 'Enter your name.').max(80), username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers, and underscores.'), password: z.string().min(12, 'Use at least 12 characters.').max(72).refine(v => new TextEncoder().encode(v).length <= 72, 'Password must be at most 72 UTF-8 bytes.') });
