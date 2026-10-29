import type { ExportJob } from './api';

export class ExportWaitError extends Error {}

async function boundedFetch(
  fetchJob: (id: string, signal: AbortSignal) => Promise<ExportJob>,
  id: string,
  signal: AbortSignal,
): Promise<ExportJob> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('查询超时')), 15_000);
  try {
    signal.throwIfAborted();
    return await fetchJob(id, controller.signal);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forwardAbort);
  }
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const aborted = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, ms);
    if (signal.aborted) aborted();
    else signal.addEventListener('abort', aborted, { once: true });
  });
}

export async function waitForExport(
  initial: ExportJob,
  fetchJob: (id: string, signal: AbortSignal) => Promise<ExportJob>,
  onUpdate: (job: ExportJob) => void,
  signal: AbortSignal,
  clock = { now: () => Date.now(), pause },
): Promise<ExportJob> {
  const startedAt = clock.now();
  let job = initial;
  let renderingSeen = job.status === 'rendering';
  while (job.status === 'queued' || job.status === 'rendering') {
    signal.throwIfAborted();
    const elapsed = clock.now() - startedAt;
    if (!renderingSeen && elapsed >= 30_000) {
      throw new ExportWaitError('任务仍在排队，PDF 服务可能未启动、未连接到同一数据库或正在繁忙。请检查 PDF worker；任务已保留，可点击“检查进度”。');
    }
    if (elapsed >= 180_000) {
      throw new ExportWaitError('等待 PDF 生成超时。任务已保留，请检查 PDF worker 日志，再点击“检查进度”，无需重复创建任务。');
    }
    await clock.pause(1_000, signal);
    try {
      // Serialize polling, and bound a stalled network request as well as task wait.
      job = await boundedFetch(fetchJob, job.id, signal);
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ExportWaitError('查询导出进度失败，请检查网络或 API 服务。任务已保留，可点击“检查进度”重试。');
    }
    renderingSeen ||= job.status === 'rendering';
    onUpdate(job);
  }
  return job;
}
