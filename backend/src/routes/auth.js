import { Router } from 'express';
import { registerSchema, loginSchema } from '../validators/auth.js';
import { validate } from '../middleware/validate.js';
export function authRoutes(controller, guard, rateLimit) {
  const router = Router();
  router.post('/register', rateLimit, validate(registerSchema), controller.register);
  router.post('/login', rateLimit, validate(loginSchema), controller.login);
  router.post('/refresh', rateLimit, controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', guard, controller.me);
  return router;
}
