import express from 'express';
import { existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function mountFrontend(
  app,
  directory = fileURLToPath(new URL('../../../frontend/dist/', import.meta.url)),
) {
  const index = resolve(directory, 'index.html');
  if (!existsSync(index))
    throw new Error(
      'Frontend build is missing. Run npm run build before starting with SERVE_FRONTEND=true.',
    );
  app.use(express.static(directory, { index: false, maxAge: 0, dotfiles: 'deny' }));
  app.get('/{*path}', (req, res, next) => {
    if (
      /^\/(api|socket\.io|assets|health|ready)(\/|$)/.test(req.path) ||
      extname(req.path) ||
      !req.accepts('html')
    )
      return next();
    res.set('Cache-Control', 'no-store').sendFile(index);
  });
}
