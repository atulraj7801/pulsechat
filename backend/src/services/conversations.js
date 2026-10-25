import { randomUUID } from 'node:crypto';
import { assert } from '../utils/errors.js';
export function conversationService(repo, events) {
  async function membership(id, userId, trx) {
    const member = await repo.member(id, userId, trx);
    assert(member, 403, 'FORBIDDEN', 'You are not a member of this conversation.');
    return member;
  }
  const manager = (member) =>
    assert(
      ['owner', 'admin'].includes(member.role),
      403,
      'FORBIDDEN',
      'Only conversation admins can make this change.',
    );
  async function detail(id, userId) {
    await membership(id, userId);
    return { ...(await repo.find(id)), members: await repo.members(id) };
  }
  return {
    membership,
    detail,
    async list(userId) {
      const rows = await repo.list(userId);
      return Promise.all(
        rows.map(async (c) => ({ ...c, members: c.is_member ? await repo.members(c.id) : [] })),
      );
    },
    async create(userId, data) {
      const ids = [...new Set([userId, ...data.member_ids])];
      assert(
        data.type !== 'direct' || ids.length === 2,
        400,
        'INVALID_MEMBERS',
        'Choose someone other than yourself.',
      );
      const result = await repo.transaction(async (trx) => {
        assert(
          (await repo.userCount(ids, trx)) === ids.length,
          400,
          'INVALID_MEMBERS',
          'One or more users could not be found.',
        );
        const direct_key = data.type === 'direct' ? ids.sort().join(':') : null;
        if (direct_key) {
          await repo.lockDirectKey(direct_key, trx);
          const existing = await repo.direct(direct_key, trx);
          if (existing) return existing;
        }
        const conversation = await repo.create(
          {
            type: data.type,
            name: data.name || null,
            description: data.description,
            is_private: data.type === 'direct' || data.is_private,
            created_by: userId,
            direct_key,
            slug:
              data.type === 'channel'
                ? `${data.name
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .slice(0, 70)}-${randomUUID().slice(0, 8)}`
                : null,
          },
          trx,
        );
        await repo.addMembers(
          ids.map((user_id) => ({
            conversation_id: conversation.id,
            user_id,
            role: user_id === userId ? 'owner' : 'member',
          })),
          trx,
        );
        await repo.audit(
          { user_id: userId, action: 'conversation.created', resource_id: conversation.id },
          trx,
        );
        return conversation;
      });
      await events.conversation(result.id, ids);
      return detail(result.id, userId);
    },
    async update(id, userId, data) {
      await repo.transaction(async (trx) => {
        const c = await repo.lock(id, trx);
        manager(await membership(id, userId, trx));
        assert(
          c.type !== 'direct',
          400,
          'DIRECT_IMMUTABLE',
          'Direct conversation settings cannot be changed.',
        );
        await repo.update(id, data, trx);
        await repo.audit({ user_id: userId, action: 'conversation.updated', resource_id: id }, trx);
      });
      await events.conversation(id);
      return detail(id, userId);
    },
    async remove(id, userId) {
      const members = await repo.transaction(async (trx) => {
        await repo.lock(id, trx);
        const member = await membership(id, userId, trx);
        assert(
          member.role === 'owner',
          403,
          'FORBIDDEN',
          'Only the owner can delete this conversation.',
        );
        const members = await repo.members(id, trx);
        await repo.delete(id, trx);
        await repo.audit({ user_id: userId, action: 'conversation.deleted', resource_id: id }, trx);
        return members;
      });
      await events.removed(
        id,
        members.map((m) => m.id),
      );
    },
    async addMember(id, userId, data) {
      await repo.transaction(async (trx) => {
        const c = await repo.lock(id, trx);
        assert(c, 404, 'NOT_FOUND', 'Conversation not found.');
        const selfJoin =
          data.user_id === userId &&
          c.type === 'channel' &&
          !c.is_private &&
          data.role === 'member';
        if (!selfJoin) {
          const member = await membership(id, userId, trx);
          manager(member);
          if (data.role === 'admin')
            assert(member.role === 'owner', 403, 'FORBIDDEN', 'Only the owner may appoint admins.');
        }
        assert(c.type !== 'direct', 400, 'DIRECT_IMMUTABLE', 'Create a group to add more people.');
        assert(
          (await repo.userCount([data.user_id], trx)) === 1,
          404,
          'NOT_FOUND',
          'User not found.',
        );
        await repo.addMembers(
          [{ conversation_id: id, user_id: data.user_id, role: data.role }],
          trx,
        );
        await repo.audit({ user_id: userId, action: 'member.added', resource_id: id }, trx);
      });
      await events.conversation(id, [data.user_id]);
    },
    async removeMember(id, userId, targetId) {
      await repo.transaction(async (trx) => {
        const c = await repo.lock(id, trx);
        const member = await membership(id, userId, trx);
        const target = await membership(id, targetId, trx);
        assert(
          c.type !== 'direct',
          400,
          'DIRECT_IMMUTABLE',
          'Direct conversation members cannot be removed.',
        );
        assert(
          target.role !== 'owner',
          400,
          'OWNER_REQUIRED',
          'The owner must remain in the conversation.',
        );
        if (userId !== targetId) {
          manager(member);
          assert(
            member.role === 'owner' || target.role === 'member',
            403,
            'FORBIDDEN',
            'Admins cannot remove other admins.',
          );
        }
        await repo.removeMember(id, targetId, trx);
        await repo.clearNotifications(id, targetId, trx);
        await repo.audit({ user_id: userId, action: 'member.removed', resource_id: id }, trx);
      });
      await events.kick(id, targetId);
      await events.conversation(id, [targetId]);
    },
  };
}
