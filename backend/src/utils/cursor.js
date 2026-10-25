import { z } from 'zod';
import { AppError } from './errors.js';
const cursorSchema = z.object({ at: z.iso.datetime(), id: z.uuid() });
export const encodeCursor = (row) =>
  Buffer.from(JSON.stringify({ at: new Date(row.created_at).toISOString(), id: row.id })).toString(
    'base64url',
  );
export function decodeCursor(value) {
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString()));
  } catch {
    throw new AppError(400, 'INVALID_CURSOR', 'The message cursor is invalid.');
  }
}
