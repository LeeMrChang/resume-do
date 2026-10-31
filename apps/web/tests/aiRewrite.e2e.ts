import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultDocument, createDefaultAppearance } from '@resume-do/schema';

test('AI polish/condense require consent, show suggestions and adopt into autosave', { timeout: 120_000 }, async () => {
  const base = 'http://localhost:4198';
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  await readFile(path.join(dist, 'index.html'));

  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route(`${base}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith('/api/')) return route.fallback();
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(dist, relative);
      if (!file.startsWith(dist)) throw new Error('Invalid asset path');
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });

    const source = '负责订单模块开发，也处理了一些慢 SQL。';
    const polish = '负责订单模块开发与慢 SQL 优化。';
    const condense = '负责订单模块开发，优化慢 SQL。';
    const record = {
      id: 'e2e', title: 'AI 回归', revision: 1,
      document: createDefaultDocument(), appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    record.document.intent.role = 'Java 后端工程师';
    const evaluation = record.document.sections.find((section) => section.id === 'evaluation')!;
    evaluation.items[0].body = `<p>${source}</p>`;
    const calls: Array<{ requestId: string; action: string; text: string; section?: string; targetRole?: string; privacyConsent: boolean }> = [];

    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      if (url === '/api/ai/rewrite') {
        const payload = request.postDataJSON();
        calls.push(payload);
        const rewrittenText = payload.action === 'polish' ? polish : condense;
        await route.fulfill({
          json: {
            requestId: payload.requestId,
            action: payload.action,
            originalText: payload.text,
            rewrittenText,
            warnings: ['AI 建议可能存在事实偏差，请核对公司、时间、技术名称和成果后再采用'],
          },
        });
        return;
      }
      let body: unknown;
      if (url === '/api/auth/me') body = { id: 1, email: 'test@example.com', displayName: '回归测试' };
      else if (url === '/api/resumes') body = [record];
      else if (url === '/api/resumes/e2e') {
        if (request.method() === 'PATCH') {
          const payload = request.postDataJSON();
          assert.equal(payload.baseRevision, record.revision);
          record.revision += 1;
          record.document = payload.document;
          record.appearance = payload.appearance;
          body = record;
        } else body = record;
      } else throw new Error(`Unexpected API: ${url}`);
      await route.fulfill({ json: body });
    });

    await page.goto(base);
    await page.locator('.resume-card .card-open').first().click();
    await page.getByRole('tab', { name: '自我评价' }).click();
    const editor = page.getByRole('textbox', { name: '自我评价正文', exact: true });
    await editor.waitFor();
    await page.getByRole('button', { name: 'AI 润色', exact: true }).click();

    const dialog = page.getByRole('dialog');
    const submit = dialog.getByRole('button', { name: 'AI 润色', exact: true });
    assert.equal(await submit.isDisabled(), true, 'consent is unchecked by default');
    assert.match(await dialog.innerText(), /将把当前模块正文和意向职位“Java 后端工程师”发送给 DeepSeek/);
    assert.equal(await dialog.getByLabel('待发送正文').innerText(), source);
    await dialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).check();
    await submit.click();

    const result = page.locator('.ai-result');
    await result.waitFor();
    assert.match(await result.innerText(), /AI 建议可能存在事实偏差/);
    assert.match(await result.innerText(), new RegExp(polish));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].action, 'polish');
    assert.equal(calls[0].text, source);
    assert.equal(calls[0].section, 'evaluation');
    assert.equal(calls[0].targetRole, 'Java 后端工程师');
    assert.equal(calls[0].privacyConsent, true);
    assert.match(calls[0].requestId, /^[0-9a-f-]{36}$/);

    await result.getByRole('button', { name: '采用建议' }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor({ timeout: 10_000 });
    assert.match(await editor.innerText(), new RegExp(polish));
    assert.match(record.document.sections.find((section) => section.id === 'evaluation')!.items[0].body, new RegExp(polish));

    await page.getByRole('button', { name: '精炼内容', exact: true }).click();
    const condenseDialog = page.getByRole('dialog');
    assert.equal(await condenseDialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).isChecked(), false, 'consent must be explicit every time');
    await condenseDialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).check();
    await condenseDialog.getByRole('button', { name: '精炼内容', exact: true }).click();
    await page.locator('.ai-result').waitFor();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].action, 'condense');
    assert.equal(calls[1].text, polish);

    await editor.fill('生成期间修改的正文');
    await page.locator('.ai-result').getByRole('button', { name: '采用建议' }).click();
    const overwrite = page.locator('.ai-overwrite');
    await overwrite.waitFor();
    assert.match(await overwrite.innerText(), /正文在生成期间已修改/);
    await overwrite.getByRole('button', { name: '确认覆盖' }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor({ timeout: 10_000 });
    assert.match(await editor.innerText(), new RegExp(condense));
    assert.match(record.document.sections.find((section) => section.id === 'evaluation')!.items[0].body, new RegExp(condense));

    console.log('AI browser assertions passed. API and model are mocked; no paid model call or real database touched.');
  } finally {
    await browser?.close();
  }
});
