import pino from 'pino';
export function createLogger(level = 'info') {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'password',
        'password_hash',
        'token',
        'refresh_token',
      ],
      censor: '[REDACTED]',
    },
  });
}
