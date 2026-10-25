import { assert } from '../utils/errors.js';
export function messageService(repo, conversations, events) {
  async function authorized(id, userId, trx) {
    const message = await repo.find(id, trx);
    assert(message, 404, 'NOT_FOUND', 'Message not found.');
    await conversations.membership(message.conversation_id, userId, trx);
    return message;
  }
  return {
    async history(id, userId, query) {
      await conversations.membership(id, userId);
      return repo.history(id, query);
    },
    async send(conversation_id, sender_id, data) {
      const result = await repo.transaction(async (trx) => {
        await repo.lockConversation(conversation_id, trx);
        await conversations.membership(conversation_id, sender_id, trx);
        await repo.lockRetryKey(sender_id, data.client_message_id, trx);
        const existing = await repo.duplicate(sender_id, data.client_message_id, trx);
        if (existing) {
          assert(
            existing.conversation_id === conversation_id,
            409,
            'IDEMPOTENCY_CONFLICT',
            'This message key belongs to a different conversation.',
          );
          return { message: existing, duplicate: true, notifications: [] };
        }
        if (data.reply_to_id) {
          const reply = await repo.find(data.reply_to_id, trx);
          assert(
            reply && reply.conversation_id === conversation_id && !reply.deleted_at,
            400,
            'INVALID_REPLY',
            'The reply must reference a message in this conversation.',
          );
        }
        if (data.attachment_ids.length) {
          const files = await repo.attachmentRows(data.attachment_ids, trx);
          assert(
            files.length === new Set(data.attachment_ids).size &&
              files.every(
                (a) =>
                  a.user_id === sender_id &&
                  a.conversation_id === conversation_id &&
                  a.uploaded_at &&
                  !a.message_id &&
                  new Date(a.created_at) > new Date(Date.now() - 86400000),
              ),
            400,
            'INVALID_ATTACHMENT',
            'One or more attachments are unavailable.',
          );
        }
        const message = await repo.create(
          {
            conversation_id,
            sender_id,
            body: data.body,
            client_message_id: data.client_message_id,
            reply_to_id: data.reply_to_id || null,
            message_type: data.attachment_ids.length ? 'file' : 'text',
          },
          trx,
        );
        if (data.attachment_ids.length) await repo.attach(data.attachment_ids, message.id, trx);
        await repo.touchConversation(conversation_id, trx);
        const notifications = await repo.notify(message, trx);
        return { message, notifications, duplicate: false };
      });
      const message = await repo.full(result.message.id);
      if (!result.duplicate) await events.message('message:new', message, result.notifications);
      return { message, duplicate: result.duplicate };
    },
    async edit(id, userId, data) {
      await repo.transaction(async (trx) => {
        let message = await authorized(id, userId, trx);
        await repo.lockConversation(message.conversation_id, trx);
        await conversations.membership(message.conversation_id, userId, trx);
        message = await repo.lockMessage(id, trx);
        assert(!message.deleted_at, 409, 'DELETED', 'This message was deleted.');
        if ('body' in data)
          assert(
            message.sender_id === userId,
            403,
            'FORBIDDEN',
            'You can only edit your own messages.',
          );
        await repo.update(
          id,
          { ...data, ...('body' in data ? { edited_at: new Date() } : {}) },
          trx,
        );
        await repo.audit({ user_id: userId, action: 'message.updated', resource_id: id }, trx);
      });
      const message = await repo.full(id);
      await events.message('message:updated', message);
      return message;
    },
    async remove(id, userId) {
      await repo.transaction(async (trx) => {
        const message = await authorized(id, userId, trx);
        await repo.lockConversation(message.conversation_id, trx);
        const member = await conversations.membership(message.conversation_id, userId, trx);
        assert(
          message.sender_id === userId || ['owner', 'admin'].includes(member.role),
          403,
          'FORBIDDEN',
          'You cannot delete this message.',
        );
        await repo.lockMessage(id, trx);
        await repo.update(id, { body: '', deleted_at: new Date(), is_pinned: false }, trx);
        await repo.audit({ user_id: userId, action: 'message.deleted', resource_id: id }, trx);
      });
      const message = await repo.full(id);
      await events.message('message:deleted', message);
    },
    async reaction(id, userId, emoji, add) {
      await repo.transaction(async (trx) => {
        const message = await authorized(id, userId, trx);
        await repo.lockConversation(message.conversation_id, trx);
        await conversations.membership(message.conversation_id, userId, trx);
        const locked = await repo.lockMessage(id, trx);
        assert(!locked.deleted_at, 409, 'DELETED', 'This message was deleted.');
        await repo.reaction(id, userId, emoji, add, trx);
        await repo.update(id, {}, trx);
      });
      const message = await repo.full(id);
      await events.message('message:updated', message);
      return message;
    },
    async read(id, userId) {
      const result = await repo.transaction(async (trx) => {
        const message = await authorized(id, userId, trx);
        await repo.lockConversation(message.conversation_id, trx);
        await conversations.membership(message.conversation_id, userId, trx);
        return { message, changed: await repo.read(message, userId, trx) };
      });
      if (result.changed)
        await events.read({
          conversation_id: result.message.conversation_id,
          user_id: userId,
          message_id: id,
          created_at: result.message.created_at,
        });
      return { ok: true };
    },
    search: (userId, query) => repo.search(userId, query),
  };
}
