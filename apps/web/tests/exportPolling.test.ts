import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForExport, ExportWaitError } from '../src/exportPolling';
import type { ExportJob } from '../src/api';

const job: ExportJob = { id: 'existing', status: 'queued', filename: 'resume.pdf' };
function clock() {
  let time = 0;
  return { now: () => time, pause: async (ms: number) => { time += ms; } };
}

test('no worker: queued task stops waiting with a useful diagnostic, preserving its ID', async () => {
  let polls = 0;
  await assert.rejects(waitForExport(job, async id => {
    assert.equal(id, job.id); polls++; return job;
  }, () => {}, new AbortController().signal, clock()), error => error instanceof ExportWaitError && /PDF worker/.test(error.message));
  assert.equal(polls, 30);
});

test('queued to rendering to ready resolves the downloadable task', async () => {
  const states: ExportJob['status'][] = ['rendering', 'ready'];
  const updates: string[] = [];
  const result = await waitForExport(job, async () => ({ ...job, status: states.shift()! }),
    next => updates.push(next.status), new AbortController().signal, clock());
  assert.equal(result.status, 'ready');
  assert.deepEqual(updates, ['rendering', 'ready']);
});

test('stuck renderer has a total deadline; retry can check the same task', async () => {
  const active: ExportJob = { ...job, status: 'rendering' };
  await assert.rejects(waitForExport(active, async () => active, () => {}, new AbortController().signal, clock()), /等待 PDF 生成超时/);
  const ready = await waitForExport(active, async id => ({ ...active, id, status: 'ready' }), () => {}, new AbortController().signal, clock());
  assert.equal(ready.id, job.id);
  assert.equal(ready.status, 'ready');
});

test('failed jobs stop polling and retain the worker error', async () => {
  const result = await waitForExport(job, async () => ({ ...job, status: 'failed', errorMessage: '浏览器缺失' }), () => {}, new AbortController().signal, clock());
  assert.equal(result.errorMessage, '浏览器缺失');
});

test('network error offers checking progress; unmount cancellation makes no further requests', async () => {
  await assert.rejects(waitForExport(job, async () => { throw new Error('offline'); }, () => {}, new AbortController().signal, clock()), /查询导出进度失败/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(waitForExport(job, async () => { assert.fail('must not fetch'); }, () => {}, controller.signal, clock()), { name: 'AbortError' });
});
