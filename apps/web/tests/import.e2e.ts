import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultAppearance, createDefaultDocument } from '@resume-do/schema';
import type { ImportJob, ResumeResponse } from '../src/api';

// Isolated UI regression: real production bundle + in-memory API; no user data.
test('import: close before confirm creates nothing; corrected draft survives reload; confirm creates a distinct editable resume', { timeout: 90_000 }, async () => {
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  const base = 'http://resume-do.test';
  const browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const timestamp = new Date().toISOString();
    const initialDoc = createDefaultDocument(); initialDoc.basic.name = '原简历姓名';
    const original: ResumeResponse = { id: 'original', title: '原简历', revision: 1, document: initialDoc,
      appearance: createDefaultAppearance(), createdAt: timestamp, updatedAt: timestamp };
    const records = new Map<string, ResumeResponse>([[original.id, structuredClone(original)]]);
    const imports = new Map<string, ImportJob>();
    let nextImport = 0;
    await page.route(`${base}/**`, async route => {
      const request = route.request(), url = new URL(request.url()).pathname;
      let body: unknown;
      if (url === '/api/auth/me') body = { id: 1, email: 'test@example.com', displayName: '测试' };
      else if (url === '/api/resumes') {
        assert.equal(request.method(), 'GET', 'opening or closing import must not POST a resume');
        body = [...records.values()];
      } else if (url.startsWith('/api/resumes/')) {
        const record = records.get(url.split('/')[3])!;
        if (request.method() === 'PATCH') Object.assign(record, request.postDataJSON(), { revision: record.revision + 1 });
        body = record;
      } else if (url === '/api/imports') {
        if (request.method() === 'POST') {
          assert.match(request.headers()['content-type'], /^multipart\/form-data; boundary=/);
          const document = createDefaultDocument(); document.basic.name = '导入姓名';
          const entry: ImportJob = { id: `import-${++nextImport}`, filename: 'resume.pdf', status: 'ready', sourceText: '姓名：导入姓名\n原文完整保留',
            draft: { title: '导入简历', document, appearance: createDefaultAppearance() }, version: 0, expiresAt: new Date(Date.now() + 86400000).toISOString() };
          imports.set(entry.id, entry); body = entry;
        } else body = [...imports.values()].filter(item => item.status !== 'confirmed' && item.status !== 'cancelled');
      } else if (url.startsWith('/api/imports/')) {
        const [, , , id, action] = url.split('/');
        const entry = imports.get(id)!;
        if (action === 'confirm') {
          assert.equal(request.postDataJSON().version, entry.version);
          if (!entry.resumeId) {
            const record: ResumeResponse = { id: `created-${id}`, ...structuredClone(entry.draft!), revision: 0, createdAt: timestamp, updatedAt: timestamp };
            records.set(record.id, record); entry.resumeId = record.id; entry.status = 'confirmed';
          }
          body = records.get(entry.resumeId);
        } else if (request.method() === 'PATCH') {
          const payload = request.postDataJSON(); assert.equal(payload.version, entry.version);
          entry.draft = payload.draft; entry.version++; body = entry;
        } else if (request.method() === 'DELETE') {
          entry.status = 'cancelled'; await route.fulfill({ status: 204 }); return;
        } else body = entry;
      } else {
        const file = path.join(dist, url === '/' ? 'index.html' : url.slice(1));
        const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
        await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' }); return;
      }
      await route.fulfill({ json: body });
    });
    await page.goto(base);
    await page.getByRole('button', { name: '导入简历', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: '导入已有简历' });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 test fixture') });
    await dialog.getByLabel('姓名', { exact: true }).fill('校对后的姓名');
    await dialog.getByRole('button', { name: '保存草稿并关闭' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(records.size, 1);
    await page.reload();
    await page.getByRole('button', { name: '导入简历', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '导入已有简历' });
    await dialog.getByLabel('姓名', { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel('姓名', { exact: true }).inputValue(), '校对后的姓名');
    await dialog.getByRole('button', { name: '确认导入为新简历' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(records.size, 2);
    assert.deepEqual(records.get(original.id), original);
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '校对后的姓名');
    await page.reload();
    await page.getByLabel('姓名', { exact: true }).waitFor();
    assert.equal(await page.getByLabel('姓名', { exact: true }).inputValue(), '校对后的姓名');
    await page.getByLabel('切换简历', { exact: true }).selectOption('original');
    await page.getByLabel('姓名', { exact: true }).waitFor();
    // Wait for the selected record to render, rather than comparing stale input.
    await page.getByLabel('姓名', { exact: true }).evaluate((input: HTMLInputElement) => input.value);
    assert.equal(records.get(original.id)!.document.basic.name, '原简历姓名');
    await page.getByRole('button', { name: '导入简历', exact: true }).click();
    dialog = page.getByRole('dialog', { name: '导入已有简历' });
    await dialog.locator('input[type=file]').setInputFiles({ name: 'resume.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 same file') });
    await dialog.getByRole('button', { name: '确认导入为新简历' }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(records.size, 3, 'a second upload creates a separate resume');
    assert.deepEqual(records.get(original.id), original);
  } finally { await browser.close(); }
});
