import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { createDefaultAppearance, createDefaultDocument } from '@resume-do/schema';
import type { ExportJob, OriginalSource, ResumeResponse } from '../src/api';

const base = 'http://localhost:4198';
const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const fixture = new URL('./fixtures/original-mixed.pdf', import.meta.url);

async function setup(page: Page, source?: OriginalSource) {
  const record: ResumeResponse = {
    id: 'export-test', kind: 'structured', title: '导出回归', revision: 1,
    document: createDefaultDocument(), appearance: createDefaultAppearance(), source,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  record.document.basic.name = '导出前';
  const state = {
    saveFails: false, renderFails: false, downloadFails: false,
    requests: [] as Array<{ revision: number; idempotencyKey: string; filename: string }>,
    snapshots: [] as string[], sourceDownloads: 0, downloads: 0,
  };
  await page.route(`${base}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith('/api/')) return route.fallback();
    const file = path.resolve(dist, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file.startsWith(dist + path.sep)) throw new Error('Invalid asset path');
    const types: Record<string, string> = {
      '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    };
    await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
  });
  let job: ExportJob;
  await page.route('**/api/**', async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === '/api/auth/me') return route.fulfill({ json: { id: 99, displayName: '导出测试', themePreference: 'dark' } });
    if (pathname === '/api/resumes') return route.fulfill({ json: [record] });
    if (pathname === '/api/resumes/export-test') {
      if (request.method() === 'PATCH') {
        if (state.saveFails) return route.fulfill({ status: 503, json: { message: '保存暂不可用' } });
        const payload = request.postDataJSON();
        assert.equal(payload.baseRevision, record.revision);
        Object.assign(record, { ...payload, revision: record.revision + 1, updatedAt: new Date().toISOString() });
      }
      return route.fulfill({ json: record });
    }
    if (pathname === '/api/resumes/export-test/exports') {
      const payload = request.postDataJSON();
      assert.equal(payload.revision, record.revision, 'export must use the saved revision');
      state.requests.push(payload);
      state.snapshots.push(record.document.basic.name);
      job = { id: `job-${state.requests.length}`, status: 'queued', filename: payload.filename };
      return route.fulfill({ json: job });
    }
    if (pathname === '/api/resumes/export-test/source') {
      state.sourceDownloads++;
      return route.fulfill({ body: await readFile(fixture), contentType: 'application/pdf' });
    }
    if (pathname === `/api/exports/${job?.id}`) {
      job = { ...job, status: state.renderFails ? 'failed' : 'ready', errorMessage: state.renderFails ? '生成失败，请重试' : undefined };
      return route.fulfill({ json: job });
    }
    if (pathname === `/api/exports/${job?.id}/file`) {
      state.downloads++;
      if (state.downloadFails) return route.fulfill({ status: 503, json: { message: '下载暂不可用' } });
      return route.fulfill({ body: await readFile(fixture), contentType: 'application/pdf' });
    }
    throw new Error(`Unexpected API: ${request.method()} ${pathname}`);
  });
  await page.goto(base);
  await page.locator('.resume-card .card-open').first().click();
  await page.getByLabel('姓名', { exact: true }).waitFor();
  return state;
}

const openExport = (page: Page) => page.getByRole('button', { name: '↓ 下载 PDF', exact: true }).click();
const dialog = (page: Page) => page.getByRole('dialog', { name: '导出 PDF', exact: true });

for (const kind of ['pdf', 'docx', 'none'] as const) {
  test(`PDF export uses the current edited snapshot with ${kind} source`, { timeout: 60_000 }, async () => {
    const browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const source = kind === 'none' ? undefined : {
        filename: `original.${kind}`, mime: kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bytes: 100, pages: kind === 'pdf' ? 9 : null,
      };
      const state = await setup(page, source);
      await page.getByLabel('姓名', { exact: true }).fill('最新编辑内容');
      await openExport(page);
      assert.equal(await dialog(page).getByRole('radio').count(), 0, 'remove original/edited version choice');
      await dialog(page).getByText('当前编辑版', { exact: true }).waitFor();
      assert.doesNotMatch(await dialog(page).innerText(), /原件版|Word 原件|共 9 页/);
      assert.equal(state.requests.length, 0, 'opening the dialog does not start exporting');
      const download = page.waitForEvent('download');
      await dialog(page).getByRole('button', { name: '下载 PDF', exact: true }).click();
      assert.equal(await dialog(page).getByRole('button', { name: '正在生成…', exact: true }).isDisabled(), true);
      const saved = await download;
      await saved.path();
      assert.equal(saved.suggestedFilename(), '导出回归.pdf', 'filename follows the resume title');
      assert.equal(state.requests.length, 1);
      assert.deepEqual(state.snapshots, ['最新编辑内容']);
      assert.equal(state.sourceDownloads, 0);
      await dialog(page).getByText('文件已开始下载', { exact: true }).waitFor();
      const again = page.waitForEvent('download');
      await dialog(page).getByRole('button', { name: '再次下载', exact: true }).click();
      await (await again).path();
      assert.equal(state.requests.length, 1, 'download again reuses the existing file');
    } finally { await browser.close(); }
  });
}

test('save and render failures are recoverable without downloading the original', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const state = await setup(page, { filename: 'original.pdf', mime: 'application/pdf', bytes: 100, pages: 9 });
    state.saveFails = true;
    await page.getByLabel('姓名', { exact: true }).fill('保存后再导出');
    await openExport(page);
    await dialog(page).getByRole('button', { name: '下载 PDF', exact: true }).click();
    await dialog(page).getByRole('alert').waitFor();
    assert.equal(state.requests.length, 0, 'save failure must block exporting');
    assert.equal(state.sourceDownloads, 0);
    state.saveFails = false;
    state.renderFails = true;
    await dialog(page).getByRole('button', { name: '重新生成', exact: true }).click();
    await dialog(page).getByRole('alert').filter({ hasText: '生成失败' }).waitFor();
    state.renderFails = false;
    state.downloadFails = true;
    await dialog(page).getByRole('button', { name: '重新生成', exact: true }).click();
    await dialog(page).getByRole('alert').filter({ hasText: '下载暂不可用' }).waitFor();
    assert.equal(state.requests.length, 2);
    assert.notEqual(state.requests[0].idempotencyKey, state.requests[1].idempotencyKey);
    state.downloadFails = false;
    const download = page.waitForEvent('download');
    await dialog(page).getByRole('button', { name: '再次下载', exact: true }).click();
    await (await download).path();
    assert.equal(state.requests.length, 2);
  } finally { await browser.close(); }
});

test('export summary fits dark, light and narrow screens with a long filename', { timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await setup(page, { filename: 'original.pdf', mime: 'application/pdf', bytes: 100, pages: 9 });
    await page.getByLabel('简历名称').fill('很长的简历名称用于检查导出窗口换行');
    await page.getByLabel('姓名', { exact: true }).fill('用于检查长文件名换行的测试姓名');
    await openExport(page);
    for (const [theme, width, height] of [['dark', 1280, 900], ['light', 1280, 900], ['dark', 390, 844]] as const) {
      await page.setViewportSize({ width, height });
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      const fits = await dialog(page).locator('.export-summary').evaluate(el => el.scrollWidth <= el.clientWidth);
      assert.ok(fits, 'summary must not overflow horizontally');
      const button = await dialog(page).getByRole('button', { name: '下载 PDF', exact: true }).boundingBox();
      assert.ok(button && button.x >= 0 && button.x + button.width <= width && button.y + button.height <= height);
      if (process.env.RESUME_DO_EXPORT_SCREENSHOTS) {
        await page.screenshot({ path: path.join(process.env.RESUME_DO_EXPORT_SCREENSHOTS, `export-${theme}-${width}.png`) });
      }
    }
  } finally { await browser.close(); }
});
