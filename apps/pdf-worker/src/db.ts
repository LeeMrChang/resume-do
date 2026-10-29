import mysql, { type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { config } from './config';

function decodeSnapshot(value: unknown): unknown {
  if (typeof value === 'string') return JSON.parse(value);
  if (Buffer.isBuffer(value)) return JSON.parse(value.toString('utf8'));
  return value;
}

export interface JobRow {
  id: number;
  public_id: string;
  snapshot: unknown;
  filename: string;
  attempts: number;
}

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: config.db.connectionLimit,
  charset: 'utf8mb4',
  timezone: 'Z',
});

export async function claimJob(): Promise<JobRow | null> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM export_jobs
       WHERE (status = 0 AND next_attempt_at <= UTC_TIMESTAMP(3))
          OR (status = 1 AND lease_until IS NOT NULL AND lease_until < UTC_TIMESTAMP(3))
       ORDER BY id
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
    );
    if (rows.length === 0) {
      await connection.commit();
      return null;
    }

    const id = Number(rows[0].id);
    await connection.execute(
      `UPDATE export_jobs
       SET status = 1, worker_id = ?, attempts = attempts + 1,
           lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${config.leaseSeconds} SECOND),
           started_at = COALESCE(started_at, UTC_TIMESTAMP(3)),
           error_code = NULL, error_message = NULL
       WHERE id = ?`,
      [config.workerId, id],
    );
    await connection.commit();

    const [jobRows] = await connection.query<RowDataPacket[]>(
      `SELECT id, public_id, snapshot, filename, attempts
       FROM export_jobs WHERE id = ?`,
      [id],
    );
    const row = jobRows[0];
    if (!row) return null;
    return {
      id: Number(row.id),
      public_id: String(row.public_id),
      snapshot: decodeSnapshot(row.snapshot),
      filename: String(row.filename),
      attempts: Number(row.attempts),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function heartbeat(jobId: number): Promise<void> {
  await pool.execute(
    `UPDATE export_jobs
     SET lease_until = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${config.leaseSeconds} SECOND)
     WHERE id = ? AND worker_id = ? AND status = 1`,
    [jobId, config.workerId],
  );
}

export async function markReady(
  jobId: number,
  fileKey: string,
  fileBytes: number,
  fileSha256: string,
): Promise<void> {
  await pool.execute(
    `UPDATE export_jobs
     SET status = 2, file_key = ?, file_bytes = ?, file_sha256 = ?,
         expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${config.downloadTtlMinutes} MINUTE),
         finished_at = UTC_TIMESTAMP(3), lease_until = NULL, worker_id = NULL,
         error_code = NULL, error_message = NULL
     WHERE id = ? AND status = 1`,
    [fileKey, fileBytes, fileSha256, jobId],
  );
}

export async function markFailed(
  jobId: number,
  attempts: number,
  code: string,
  message: string,
): Promise<void> {
  const finalFailure = attempts >= config.maxAttempts;
  const safeMessage = message.slice(0, 500);
  if (finalFailure) {
    await pool.execute(
      `UPDATE export_jobs
       SET status = 3, error_code = ?, error_message = ?, finished_at = UTC_TIMESTAMP(3),
           lease_until = NULL, worker_id = NULL
       WHERE id = ? AND status = 1`,
      [code, safeMessage, jobId],
    );
    return;
  }

  const backoffSeconds = Math.min(60, 10 * attempts);
  await pool.execute(
    `UPDATE export_jobs
     SET status = 0, error_code = ?, error_message = ?,
         next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${backoffSeconds} SECOND),
         lease_until = NULL, worker_id = NULL
     WHERE id = ? AND status = 1`,
    [code, safeMessage, jobId],
  );
}

export async function closePool(connection?: PoolConnection): Promise<void> {
  connection?.release();
  await pool.end();
}
