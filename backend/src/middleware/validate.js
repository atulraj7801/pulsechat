import { z } from 'zod';
export const uuid = z.uuid();
export const validate =
  (schema, location = 'body') =>
  (req, _res, next) => {
    req.validated = { ...req.validated, [location]: schema.parse(req[location]) };
    next();
  };
export const idParams = z.object({
  id: uuid,
  userId: uuid.optional(),
  emoji: z.string().max(32).optional(),
});
