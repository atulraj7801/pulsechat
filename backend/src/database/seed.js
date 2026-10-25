import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { parseEnv } from '../config/env.js';
import { createDatabase } from './connection.js';
const env = parseEnv(process.env);
if (env.NODE_ENV === 'production' && process.env.ALLOW_PRODUCTION_SEED !== 'true')
  throw new Error(
    'Demo seeding is disabled in production. Set ALLOW_PRODUCTION_SEED=true only for a demonstration deployment.',
  );
if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12)
  throw new Error('Set SEED_PASSWORD to at least 12 characters.');
const db = createDatabase(env.DATABASE_URL);
try {
  const password_hash = await bcrypt.hash(process.env.SEED_PASSWORD, 12);
  await db.transaction(async (trx) => {
    const profiles = [
      ['alex', 'Alex Morgan', 'online'],
      ['maya', 'Maya Chen', 'online'],
      ['jordan', 'Jordan Lee', 'online'],
      ['olivia', 'Olivia Park', 'away'],
      ['noah', 'Noah Williams', 'offline'],
      ['sophie', 'Sophie Taylor', 'online'],
    ];
    const users = [];
    for (const [username, display_name, status] of profiles) {
      const [user] = await trx('users')
        .insert({
          email: `${username}@pulsechat.demo`,
          username,
          display_name,
          status,
          password_hash,
        })
        .onConflict('email')
        .ignore()
        .returning('*');
      users.push(
        user ||
          (await trx('users')
            .where({ email: `${username}@pulsechat.demo` })
            .first()),
      );
    }
    for (const [slug, name, description] of [
      ['general', 'general', 'The place for team updates, good news, and everything in between.'],
      [
        'design',
        'design',
        'Thoughtful details. Better experiences. A space for all things design.',
      ],
      ['engineering', 'engineering', 'Building what’s next, one good decision at a time.'],
      ['product', 'product', 'Connecting customer needs with what we build next.'],
      ['random', 'random', 'For the things that make us more than coworkers.'],
    ]) {
      const existing = await trx('conversations').where({ slug }).first();
      if (existing) continue;
      const [channel] = await trx('conversations')
        .insert({ type: 'channel', name, slug, description, created_by: users[0].id })
        .returning('*');
      await trx('conversation_members').insert(
        users.map((u, i) => ({
          conversation_id: channel.id,
          user_id: u.id,
          role: i === 0 ? 'owner' : 'member',
        })),
      );
      const samples =
        slug === 'general'
          ? [
              [
                1,
                'Morning, team! ☀️ Hope everyone had a good weekend. A fresh week and a few exciting things on the horizon.',
              ],
              [
                2,
                'Hey everyone! Quick update: the new onboarding flow is ready for a first look. Really happy with how it’s coming together.',
              ],
              [
                2,
                'A few highlights from the latest iteration:\n• A simpler welcome experience\n• Clearer next steps for new teammates\n• A little less friction, a lot more flow ✨',
              ],
              [
                3,
                'The small details make such a difference. The new empty states are looking especially good!',
              ],
              [
                0,
                'Love the direction here. Let’s give it a thoughtful review before we share it with the rest of the team.',
              ],
              [
                1,
                'Absolutely! I’ve set aside some time this afternoon. Drop any feedback in #design so we can keep it all in one place. 💜',
              ],
              [
                5,
                'Also, a small win to start the week: we shipped the search improvements! Finding that one message should feel a lot easier now. 🎉',
              ],
            ]
          : [
              [1, `Welcome to #${name}! ${description}`],
              [2, 'A little space to share ideas, ask questions, and make progress together.'],
            ];
      let last;
      for (const [i, [sender, body]] of samples.entries()) {
        const created_at = new Date(Date.now() - (samples.length - i) * 180000);
        [last] = await trx('messages')
          .insert({
            conversation_id: channel.id,
            sender_id: users[sender].id,
            body,
            client_message_id: randomUUID(),
            created_at,
            updated_at: created_at,
            is_pinned: i === 0,
          })
          .returning('*');
        if (i === 2 || i === 6)
          await trx('message_reactions').insert([
            { message_id: last.id, user_id: users[1].id, emoji: i === 2 ? '👀' : '🎉' },
            { message_id: last.id, user_id: users[3].id, emoji: i === 2 ? '👀' : '🎉' },
          ]);
      }
      await trx('conversation_members')
        .where({ conversation_id: channel.id })
        .update({ last_read_message_id: last.id, last_read_at: last.created_at });
    }
    for (const peer of users.slice(1, 4)) {
      const direct_key = [users[0].id, peer.id].sort().join(':');
      if (await trx('conversations').where({ direct_key }).first()) continue;
      const [direct] = await trx('conversations')
        .insert({ type: 'direct', is_private: true, created_by: users[0].id, direct_key })
        .returning('*');
      await trx('conversation_members').insert([
        { conversation_id: direct.id, user_id: users[0].id, role: 'owner' },
        { conversation_id: direct.id, user_id: peer.id, role: 'member' },
      ]);
      await trx('messages').insert({
        conversation_id: direct.id,
        sender_id: peer.id,
        body: 'Hey Alex! Good to have a space to keep our conversations going. 👋',
        client_message_id: randomUUID(),
      });
    }
  });
  console.log('Demo workspace seeded. Sign in as alex@pulsechat.demo using SEED_PASSWORD.');
} finally {
  await db.destroy();
}
