import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import { assert } from '../utils/errors.js';
import { safeUser } from '../repositories/users.js';
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const lifetime = 30 * 24 * 60 * 60 * 1000;
export function authService({ users, auth, env, onRevoke = () => {} }) {
  const accessToken = (session) =>
    jwt.sign({ sid: session.id }, env.JWT_SECRET, {
      subject: session.user_id,
      expiresIn: '10m',
      issuer: 'pulsechat',
      audience: 'pulsechat-web',
      algorithm: 'HS256',
    });
  async function issue(user, trx) {
    const expires_at = new Date(Date.now() + lifetime);
    const session = await auth.createSession({ user_id: user.id, expires_at }, trx);
    const refreshToken = randomBytes(48).toString('base64url');
    await auth.createToken(
      { session_id: session.id, token_hash: hashToken(refreshToken), expires_at },
      trx,
    );
    return { user: safeUser(user), access_token: accessToken(session), refreshToken };
  }
  return {
    async register(data) {
      const password_hash = await bcrypt.hash(data.password, 12);
      return auth.transaction(async (trx) => {
        const { password: _password, ...profile } = data;
        const user = await users.create({ ...profile, password_hash }, trx);
        await auth.joinWelcome(user.id, trx);
        await auth.audit(user.id, 'auth.register', user.id, trx);
        return issue(user, trx);
      });
    },
    async login(data) {
      const user = await users.findByEmail(data.email);
      // A fixed valid bcrypt hash equalizes the missing-user password work.
      const valid = await bcrypt.compare(
        data.password,
        user?.password_hash || '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6Ttx0nxCaU62WoMVzJsgR9QfzJN6K',
      );
      assert(user && valid, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      return auth.transaction(async (trx) => {
        await auth.audit(user.id, 'auth.login', null, trx);
        return issue(user, trx);
      });
    },
    async refresh(token) {
      assert(
        typeof token === 'string' && token.length < 256,
        401,
        'INVALID_REFRESH',
        'Please sign in again.',
      );
      const result = await auth.transaction(async (trx) => {
        const old = await auth.findToken(hashToken(token), trx);
        if (!old) return null;
        const session = await auth.session(old.session_id, trx);
        if (old.used_at) {
          await auth.revoke(session.id, trx);
          return { revoked: session.id };
        }
        if (
          session.revoked_at ||
          new Date(session.expires_at) <= new Date() ||
          new Date(old.expires_at) <= new Date()
        )
          return null;
        await auth.useToken(old.id, trx);
        const refreshToken = randomBytes(48).toString('base64url');
        await auth.createToken(
          {
            session_id: session.id,
            token_hash: hashToken(refreshToken),
            expires_at: session.expires_at,
          },
          trx,
        );
        return {
          user: await users.findById(session.user_id),
          access_token: accessToken(session),
          refreshToken,
        };
      });
      if (result?.revoked) onRevoke(result.revoked);
      assert(
        result && !result.revoked,
        401,
        'INVALID_REFRESH',
        'Your session expired. Please sign in again.',
      );
      return result;
    },
    async authenticate(token) {
      let payload;
      try {
        payload = jwt.verify(token, env.JWT_SECRET, {
          issuer: 'pulsechat',
          audience: 'pulsechat-web',
          algorithms: ['HS256'],
        });
      } catch {
        assert(false, 401, 'UNAUTHORIZED', 'Please sign in to continue.');
      }
      const session = await auth.session(payload.sid);
      assert(
        session &&
          session.user_id === payload.sub &&
          !session.revoked_at &&
          new Date(session.expires_at) > new Date(),
        401,
        'UNAUTHORIZED',
        'Your session is no longer active.',
      );
      return { id: payload.sub, sessionId: payload.sid, expiresAt: payload.exp * 1000 };
    },
    async logout(token) {
      if (!token || token.length > 256) return;
      const sessionId = await auth.transaction(async (trx) => {
        const saved = await auth.findToken(hashToken(token), trx);
        if (saved) {
          await auth.revoke(saved.session_id, trx);
          return saved.session_id;
        }
      });
      if (sessionId) onRevoke(sessionId);
    },
  };
}
