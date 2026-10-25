import { Model } from 'objection';
export class User extends Model {
  static get tableName() {
    return 'users';
  }
  static get jsonSchema() {
    return {
      type: 'object',
      required: ['email', 'username', 'display_name', 'password_hash'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        email: { type: 'string', maxLength: 254 },
        username: { type: 'string', minLength: 3, maxLength: 32 },
        display_name: { type: 'string', minLength: 1, maxLength: 80 },
        password_hash: { type: 'string' },
      },
    };
  }
}
