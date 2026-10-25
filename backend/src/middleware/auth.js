export const requireAuth = (service) => async (req, _res, next) => {
  try {
    req.user = await service.authenticate(req.headers.authorization?.replace(/^Bearer /, '') || '');
    next();
  } catch (err) {
    next(err);
  }
};
