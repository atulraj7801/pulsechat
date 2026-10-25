import { maintenanceRepository } from '../repositories/maintenance.js';
import { createFileStorage } from '../services/file-storage.js';
// Distributed lock prevents multiple replicas from running the same maintenance sweep.
export function startCleanup({ db, redis, env, logger }) {
  const repo = maintenanceRepository(db);
  const storage = createFileStorage(env);
  const run = async () => {
    const locked = await redis.set('pulse:cleanup:lock', '1', 'EX', 300, 'NX');
    if (!locked) return;
    await repo.expireSessions();
    await repo.expireNotifications();
    const abandoned = await repo.abandoned();
    for (const file of abandoned) {
      await storage.remove(file.storage_key);
      await repo.removeAbandoned(file.id);
    }
    // Also reclaim files orphaned by conversation deletion after a 24-hour grace period.
    // Finish pagination before deleting, so offsets cannot skip objects.
    const orphaned = [];
    for await (const file of storage.objects()) {
      if (file.createdAt < Date.now() - 86400000 && !(await repo.fileExists(file.key)))
        orphaned.push(file.key);
    }
    for (const key of orphaned) await storage.remove(key);
  };
  const timer = setInterval(
    () => run().catch(() => logger.warn('Maintenance sweep failed; will retry')),
    3600000,
  ).unref();
  return () => clearInterval(timer);
}
