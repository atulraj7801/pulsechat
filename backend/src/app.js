import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { randomUUID } from 'node:crypto';
import { userRepository } from './repositories/users.js';
import { authRepository } from './repositories/auth.js';
import { authService } from './services/auth.js';
import { authController } from './controllers/auth.js';
import { authRoutes } from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errors.js';
import { limiter } from './middleware/rate-limit.js';
import { AppError } from './utils/errors.js';
import { conversationRepository } from './repositories/conversations.js';
import { messageRepository } from './repositories/messages.js';
import { conversationService } from './services/conversations.js';
import { messageService } from './services/messages.js';
import { eventService } from './services/events.js';
import { chatController } from './controllers/chat.js';
import { chatRoutes } from './routes/chat.js';
import { extrasRepository } from './repositories/extras.js';
import { uploadService } from './services/uploads.js';
import { extrasRoutes } from './routes/extras.js';
import { mountFrontend } from './middleware/frontend.js';
export function createApp({ db, redis, env, logger }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);
  const origins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...origins.map((origin) => origin.replace(/^http/, 'ws'))],
          upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
        },
      },
    }),
    cors({ origin: origins, credentials: true }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      serializers: {
        req: (req) => ({ id: req.id, method: req.method, path: req.url?.split('?')[0] }),
        res: (res) => ({ statusCode: res.statusCode }),
      },
    }),
  );
  app.use((req, res, next) => {
    res.set('X-Request-Id', req.id);
    if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
    next();
  });
  app.use((req, _res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !origins.includes(req.headers.origin)
    )
      return next(new AppError(403, 'INVALID_ORIGIN', 'Origin is not allowed.'));
    next();
  });
  app.use(express.json({ limit: '32kb' }), cookieParser());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'pulsechat' }));
  app.get('/ready', async (_req, res) => {
    try {
      await Promise.all([db.raw('select 1'), redis.ping()]);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  const users = userRepository(db),
    auth = authRepository(db);
  const events = eventService({ logger, repo: conversationRepository(db) });
  const authentication = authService({
    users,
    auth,
    env,
    onRevoke: (sessionId) => events.revokeSession(sessionId),
  });
  const guard = requireAuth(authentication);
  app.use(
    '/api/auth',
    authRoutes(
      authController(authentication, users, env),
      guard,
      limiter(redis, 'auth', 30, 15 * 60000),
    ),
  );
  app.use('/api', limiter(redis, 'api', 300));
  app.get('/api/users/me', guard, async (req, res) =>
    res.json({ user: await users.findById(req.user.id) }),
  );
  const conversations = conversationService(conversationRepository(db), events);
  const messages = messageService(messageRepository(db), conversations, events);
  const extras = extrasRepository(db),
    uploads = uploadService({ repo: extras, conversations, env });
  app.use(
    '/api',
    extrasRoutes({
      guard,
      uploads,
      conversations,
      repo: extras,
      messagesRepo: messageRepository(db),
      uploadLimit: limiter(redis, 'uploads', 20),
    }),
  );
  app.use(
    '/api',
    chatRoutes({
      controller: chatController(conversations, messages),
      guard,
      messageLimit: limiter(redis, 'messages', 60),
      users,
      redis,
    }),
  );
  const services = { authentication, users, auth, conversations, messages, events };
  app.locals.services = services;
  // Feature routers are installed here before the centralized error handler.
  app.locals.finalize = () => {
    if (env.SERVE_FRONTEND) mountFrontend(app);
    app.use((_req, _res, next) =>
      next(new AppError(404, 'NOT_FOUND', 'This endpoint does not exist.')),
    );
    app.use(errorHandler(logger));
  };
  return app;
}
