import { createHash } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config';
import { claimJob, cleanupExpiredExports, heartbeat, markFailed, markReady, pool, type JobRow } from './db';
import { PdfRenderer, RenderError, parseSnapshot } from './renderer';

const renderer = new PdfRenderer();
let running = true;

const DETERMINISTIC_FAILURES = new Set([
  'CONTENT_OVERFLOW',
  'INVALID_SNAPSHOT',
  'TEMPLATE_VERSION_UNSUPPORTED',
  'RENDERER_VERSION_UNSUPPORTED',
  'MEASURE_FAILED',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new RenderError('RENDER_TIMEOUT', '生成超时，请重试')),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function processJob(job: JobRow): Promise<void> {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    heartbeat(job.id).catch((error: unknown) => {
      console.error('heartbeat failed', { jobId: job.id, error: String(error) });
    });
  }, config.heartbeatMs);

  try {
    const input = parseSnapshot(job.snapshot);
    const pdf = await withTimeout(renderer.render(input), config.renderTimeoutMs);

    const directory = path.join(config.storageDir, 'exports');
    await mkdir(directory, { recursive: true });
    const fileKey = `exports/${job.public_id}.pdf`;
    const target = path.join(config.storageDir, fileKey);
    const temporary = `${target}.tmp`;
    await writeFile(temporary, pdf);
    await rename(temporary, target);

    await markReady(job.id, fileKey, pdf.length, sha256(pdf));
    console.log('export ready', {
      jobId: job.id,
      bytes: pdf.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const code = error instanceof RenderError ? error.code : 'RENDER_FAILED';
    const message =
      error instanceof RenderError ? error.message : '生成失败，请稍后重试';
    if (code === 'RENDER_TIMEOUT') {
      await renderer.close();
    }
    const deterministic = DETERMINISTIC_FAILURES.has(code);
    await markFailed(job.id, deterministic ? config.maxAttempts : job.attempts, code, message);
    console.error('export failed', {
      jobId: job.id,
      code,
      attempts: job.attempts,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    clearInterval(timer);
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log('shutting down', { signal });
  running = false;
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

async function main(): Promise<void> {
  console.log('pdf worker started', {
    workerId: config.workerId,
    database: `${config.db.host}:${config.db.port}/${config.db.database}`,
    storageDir: config.storageDir,
  });

  let nextCleanupAt = 0;
  while (running) {
    if (Date.now() >= nextCleanupAt) {
      nextCleanupAt = Date.now() + 60_000;
      try {
        await cleanupExpiredExports();
      } catch (error) {
        console.error('export cleanup failed', { error: String(error) });
      }
    }
    let job: JobRow | null = null;
    try {
      job = await claimJob();
    } catch (error) {
      console.error('claim failed', { error: String(error) });
      await sleep(config.pollMs);
      continue;
    }

    if (!job) {
      await sleep(config.pollMs);
      continue;
    }

    await processJob(job);
  }

  await renderer.close();
  await pool.end();
}

main().catch((error) => {
  console.error('worker crashed', error);
  process.exitCode = 1;
});
