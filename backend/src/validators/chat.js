import { z } from 'zod';
export const id = z.uuid();
export const conversationSchema = z
  .object({
    type: z.enum(['direct', 'group', 'channel']),
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).default(''),
    is_private: z.boolean().default(false),
    member_ids: z.array(id).max(100).default([]),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'direct' && v.member_ids.length !== 1)
      ctx.addIssue({ code: 'custom', path: ['member_ids'], message: 'Choose exactly one person.' });
    if (v.type !== 'direct' && !v.name)
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'A name is required.' });
  });
export const conversationPatch = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional(),
    is_private: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length, 'Provide at least one field.');
export const messageSchema = z
  .object({
    body: z.string().trim().max(10000).default(''),
    client_message_id: id,
    reply_to_id: id.nullish(),
    attachment_ids: z.array(id).max(5).default([]),
  })
  .strict()
  .refine((v) => v.body.length || v.attachment_ids.length, 'Write a message or attach a file.');
export const messagePatch = z
  .object({
    body: z.string().trim().min(1).max(10000).optional(),
    is_pinned: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length === 1, 'Provide body or is_pinned.');
export const reactionSchema = z
  .object({ emoji: z.enum(['👍', '❤️', '😂', '🎉', '👀', '🚀', '✅', '🙌']) })
  .strict();
export const historyQuery = z
  .object({
    before: z.string().max(400).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
export const searchQuery = z
  .object({ q: z.string().trim().min(2).max(150), conversation_id: id.optional() })
  .strict();
export const memberSchema = z
  .object({ user_id: id, role: z.enum(['member', 'admin']).default('member') })
  .strict();
export const profileSchema = z
  .object({
    display_name: z.string().trim().min(1).max(80).optional(),
    avatar_url: z
      .string()
      .max(500)
      .url()
      .refine((v) => v.startsWith('https://'), 'Avatar must use HTTPS.')
      .nullable()
      .optional(),
    status: z.enum(['online', 'away', 'busy', 'offline']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length, 'Provide at least one field.');
