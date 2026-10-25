import { ZodError } from 'zod';
export function errorHandler(logger) {
  return (err, req, res, _next) => {
    let status = err.status || 500;
    let code = err.code || 'INTERNAL_ERROR';
    let message = status < 500 ? err.message : 'Something went wrong. Please try again.';
    let fields;
    if (err instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Please check your input.';
      fields = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    }
    if (err.code === '23505' || err.nativeError?.code === '23505') {
      status = 409;
      code = 'CONFLICT';
      message = 'That email, username, or resource already exists.';
    }
    if (err.code === '23503') {
      status = 400;
      code = 'INVALID_REFERENCE';
      message = 'A referenced resource does not exist.';
    }
    if (status >= 500)
      logger.error(
        {
          requestId: req.id,
          errorType: err.name,
          code: err.code,
          stack: err.stack?.split('\n').slice(1).join('\n'),
        },
        'Request failed',
      );
    res.status(status).json({ error: { code, message, fields, request_id: req.id } });
  };
}
