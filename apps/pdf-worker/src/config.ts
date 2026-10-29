import os from 'node:os';
import path from 'node:path';

function text(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function integer(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  db: {
    host: text('RESUME_DO_DB_HOST', '127.0.0.1'),
    port: integer('RESUME_DO_DB_PORT', 3306),
    user: text('RESUME_DO_DB_USER', 'resume_do'),
    password: text('RESUME_DO_DB_PASSWORD', 'change_me'),
    database: text('RESUME_DO_DB_NAME', 'resume_do'),
    connectionLimit: integer('RESUME_DO_DB_POOL_SIZE', 4),
  },
  storageDir: path.resolve(process.cwd(), text('RESUME_DO_STORAGE_DIR', '../../data')),
  workerId: text('RESUME_DO_WORKER_ID', `${os.hostname()}-${process.pid}`),
  pollMs: integer('RESUME_DO_POLL_MS', 800),
  renderTimeoutMs: integer('RESUME_DO_RENDER_TIMEOUT_MS', 30_000),
  leaseSeconds: integer('RESUME_DO_LEASE_SECONDS', 90),
  heartbeatMs: integer('RESUME_DO_HEARTBEAT_MS', 20_000),
  maxAttempts: integer('RESUME_DO_MAX_ATTEMPTS', 3),
  downloadTtlMinutes: integer('RESUME_DO_DOWNLOAD_TTL_MINUTES', 10),
  browserChannel: text('RESUME_DO_BROWSER_CHANNEL', ''),
};
