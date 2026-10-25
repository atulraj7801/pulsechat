export function chatController(conversations, messages) {
  return {
    list: async (req, res) => res.json({ conversations: await conversations.list(req.user.id) }),
    create: async (req, res) =>
      res
        .status(201)
        .json({ conversation: await conversations.create(req.user.id, req.validated.body) }),
    detail: async (req, res) =>
      res.json({ conversation: await conversations.detail(req.params.id, req.user.id) }),
    update: async (req, res) =>
      res.json({
        conversation: await conversations.update(req.params.id, req.user.id, req.validated.body),
      }),
    remove: async (req, res) => {
      await conversations.remove(req.params.id, req.user.id);
      res.status(204).end();
    },
    addMember: async (req, res) => {
      await conversations.addMember(req.params.id, req.user.id, req.validated.body);
      res.status(204).end();
    },
    removeMember: async (req, res) => {
      await conversations.removeMember(req.params.id, req.user.id, req.params.userId);
      res.status(204).end();
    },
    history: async (req, res) =>
      res.json(await messages.history(req.params.id, req.user.id, req.validated.query)),
    send: async (req, res) => {
      const result = await messages.send(req.params.id, req.user.id, req.validated.body);
      res.status(result.duplicate ? 200 : 201).json(result);
    },
    edit: async (req, res) =>
      res.json({ message: await messages.edit(req.params.id, req.user.id, req.validated.body) }),
    deleteMessage: async (req, res) => {
      await messages.remove(req.params.id, req.user.id);
      res.status(204).end();
    },
    addReaction: async (req, res) =>
      res.json({
        message: await messages.reaction(
          req.params.id,
          req.user.id,
          req.validated.body.emoji,
          true,
        ),
      }),
    removeReaction: async (req, res) =>
      res.json({
        message: await messages.reaction(
          req.params.id,
          req.user.id,
          req.validated.params.emoji,
          false,
        ),
      }),
    read: async (req, res) => res.json(await messages.read(req.params.id, req.user.id)),
    search: async (req, res) =>
      res.json({ messages: await messages.search(req.user.id, req.validated.query) }),
  };
}
