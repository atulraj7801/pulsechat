export function authController(service, users, env) {
  const options = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: 30 * 86400000,
  };
  const reply = (res, result, status = 200) => {
    const { refreshToken, ...body } = result;
    res.cookie('pulse_refresh', refreshToken, options).status(status).json(body);
  };
  return {
    register: async (req, res) => reply(res, await service.register(req.validated.body), 201),
    login: async (req, res) => reply(res, await service.login(req.validated.body)),
    refresh: async (req, res) => reply(res, await service.refresh(req.cookies.pulse_refresh)),
    logout: async (req, res) => {
      await service.logout(req.cookies.pulse_refresh);
      res
        .clearCookie('pulse_refresh', { ...options, maxAge: undefined })
        .status(204)
        .end();
    },
    me: async (req, res) => res.json({ user: await users.findById(req.user.id) }),
  };
}
