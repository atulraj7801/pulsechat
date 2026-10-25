import { User } from '../models/User.js';
export const publicFields = [
  'id',
  'email',
  'username',
  'display_name',
  'avatar_url',
  'status',
  'last_seen_at',
  'created_at',
];
export const safeUser = (user) => Object.fromEntries(publicFields.map((k) => [k, user[k]]));
export function userRepository(db) {
  return {
    findByEmail: (email) => User.query(db).findOne({ email }),
    findById: (id) => User.query(db).findById(id).select(publicFields),
    create: (data, trx = db) => User.query(trx).insert(data).returning('*'),
    update: (id, data) =>
      User.query(db)
        .patchAndFetchById(id, { ...data, updated_at: new Date() })
        .then(safeUser),
    search: (q) =>
      db('users')
        .select('id', 'username', 'display_name', 'avatar_url', 'status')
        .where((builder) =>
          builder.whereILike('username', `%${q}%`).orWhereILike('display_name', `%${q}%`),
        )
        .limit(20),
  };
}
