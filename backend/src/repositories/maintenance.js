export function maintenanceRepository(db) {
  return {
    expireSessions: () => db('user_sessions').where('expires_at', '<', new Date(Date.now() - 86400000)).delete(),
    expireNotifications: () => db('notifications').whereNotNull('read_at').where('created_at', '<', new Date(Date.now() - 30 * 86400000)).delete(),
    abandoned: () => db('attachments').whereNull('message_id').where('created_at', '<', new Date(Date.now() - 86400000)),
    removeAbandoned: id => db('attachments').where({ id }).whereNull('message_id').delete(),
    fileExists: storage_key => db('attachments').where({ storage_key }).first(),
  };
}
