import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
export function limiter(redis, name, limit, windowMs = 60000) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisStore({
      prefix: `pulse:limit:${name}:`,
      sendCommand: (...args) => redis.call(...args),
    }),
    message: {
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
    },
  });
}
