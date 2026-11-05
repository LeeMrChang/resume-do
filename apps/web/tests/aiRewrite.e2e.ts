import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultDocument, createDefaultAppearance } from '@resume-do/schema';

test('BYOK AI rewrite: settings gate, browser-direct DeepSeek call, consent and autosave', { timeout: 120_000 }, async () => {
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
    const apiKey = 'sk-e2e-abcdefghijklmnop1234';
    const record = {
      id: 'e2e', title: 'AI 回归', revision: 1,
      document: createDefaultDocument(), appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    record.document.intent.role = 'Java 后端工程师';
    const evaluation = record.document.sections.find((section) => section.id === 'evaluation')!;
    evaluation.items[0].body = `<p>${source}</p>`;
    let aiApiCalls = 0;

    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      if (url.startsWith('/api/ai')) {
        aiApiCalls += 1;
        throw new Error(`AI must be browser-direct, unexpected API: ${url}`);
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

    type DeepSeekCall = {
      apiKey: string;
      model: string;
      system: string;
      payload: { text: string; section: string; targetRole: string };
    };
    const calls: DeepSeekCall[] = [];
    let mode: 'ok' | 'unauthorized' = 'ok';
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '600',
    };
    const jsonCors = { ...cors, 'content-type': 'application/json' };
    let modelChecks = 0;

    await page.route('https://api.deepseek.com/**', async route => {
      const request = route.request();
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors });
        return;
      }
      const url = new URL(request.url());
      if (url.pathname === '/models') {
        modelChecks += 1;
        assert.equal(request.headers()['authorization'], `Bearer ${apiKey}`);
        await route.fulfill({ status: 200, headers: jsonCors, body: JSON.stringify({ object: 'list', data: [] }) });
        return;
      }
      assert.equal(url.pathname, '/chat/completions');
      if (mode === 'unauthorized') {
        await route.fulfill({ status: 401, headers: jsonCors, body: JSON.stringify({ error: { message: 'Authentication Fails' } }) });
        return;
      }
      const body = request.postDataJSON();
      calls.push({
        apiKey: request.headers()['authorization'] ?? '',
        model: body.model,
        system: body.messages[0].content,
        payload: JSON.parse(body.messages[1].content),
      });
      const rewrittenText = body.messages[0].content.includes('任务：润色') ? polish : condense;
      await route.fulfill({
        status: 200,
        headers: jsonCors,
        body: JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ rewrittenText }) } }],
        }),
      });
    });

    await page.goto(base);
    await page.locator('.resume-card .card-open').first().click();
    await page.getByRole('tab', { name: '自我评价' }).click();
    const editor = page.getByRole('textbox', { name: '自我评价正文', exact: true });
    await editor.waitFor();
    // No key configured: the action button opens the BYOK settings dialog instead of calling the server.
    await page.getByRole('button', { name: '开启 AI 改写', exact: true }).click();
    const settings = page.getByRole('dialog', { name: 'AI 设置' });
    await settings.waitFor();
    assert.match(await settings.innerText(), /Key 只保存在本机浏览器/);
    assert.match(await settings.innerText(), /不经过 Resume Do 服务器/);

    await settings.getByLabel('DeepSeek API Key').fill(apiKey);
    await settings.getByRole('button', { name: '测试连接' }).click();
    await settings.getByText('Key 可用，可以保存').waitFor();
    assert.equal(modelChecks, 1);
    await settings.getByRole('checkbox', { name: '启用 AI 改写' }).check();
    await settings.getByLabel('模型').selectOption('deepseek-v4-pro');
    await settings.getByRole('button', { name: '保存并启用' }).click();

    const stored = await page.evaluate(() => localStorage.getItem('resume-do.ai'));
    assert.ok(stored && stored.includes('"model":"deepseek-v4-pro"'));

    // Settings close back to the editor; the enabled panel now offers both actions.
    await settings.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'AI 设置', exact: true }).waitFor();
    await page.getByRole('button', { name: 'AI 润色', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'AI 润色' });
    await dialog.waitFor();
    const submit = dialog.getByRole('button', { name: 'AI 润色', exact: true });
    assert.equal(await submit.isDisabled(), true, 'consent is unchecked by default');
    assert.match(await dialog.innerText(), /将把当前模块正文和意向职位“Java 后端工程师”发送给 DeepSeek/);
    assert.match(await dialog.innerText(), /由浏览器直接发往 DeepSeek/);
    assert.match(await dialog.innerText(), /sk-\*\*\*\*1234/);
    assert.equal(await dialog.getByLabel('待发送正文').innerText(), source);
    await dialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).check();
    await submit.click();

    const result = page.locator('.ai-result');
    await result.waitFor();
    assert.match(await result.innerText(), /AI 建议可能存在事实偏差/);
    assert.match(await result.innerText(), new RegExp(polish));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].apiKey, `Bearer ${apiKey}`);
    assert.equal(calls[0].model, 'deepseek-v4-pro');
    assert.match(calls[0].system, /任务：润色/);
    assert.equal(calls[0].payload.text, source);
    assert.equal(calls[0].payload.section, 'evaluation');
    assert.equal(calls[0].payload.targetRole, 'Java 后端工程师');
    assert.equal(aiApiCalls, 0);

    await result.getByRole('button', { name: '采用建议' }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor({ timeout: 10_000 });
    assert.match(await editor.innerText(), new RegExp(polish));
    assert.match(record.document.sections.find((section) => section.id === 'evaluation')!.items[0].body, new RegExp(polish));

    await page.getByRole('button', { name: '精炼内容', exact: true }).click();
    const condenseDialog = page.getByRole('dialog', { name: '精炼内容' });
    assert.equal(await condenseDialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).isChecked(), false, 'consent must be explicit every time');
    await condenseDialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).check();
    await condenseDialog.getByRole('button', { name: '精炼内容', exact: true }).click();
    await page.locator('.ai-result').waitFor();
    assert.equal(calls.length, 2);
    assert.match(calls[1].system, /任务：精炼/);
    assert.equal(calls[1].payload.text, polish);

    await editor.fill('生成期间修改的正文');
    await page.locator('.ai-result').getByRole('button', { name: '采用建议' }).click();
    const overwrite = page.locator('.ai-overwrite');
    await overwrite.waitFor();
    assert.match(await overwrite.innerText(), /正文在生成期间已修改/);
    await overwrite.getByRole('button', { name: '确认覆盖' }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor({ timeout: 10_000 });
    assert.match(await editor.innerText(), new RegExp(condense));
    assert.match(record.document.sections.find((section) => section.id === 'evaluation')!.items[0].body, new RegExp(condense));

    // An invalid key surfaces an actionable error that reopens the settings dialog.
    mode = 'unauthorized';
    await page.getByRole('button', { name: 'AI 润色', exact: true }).click();
    const retryDialog = page.getByRole('dialog', { name: 'AI 润色' });
    await retryDialog.getByLabel(/我同意将以上内容发送给 DeepSeek/).check();
    await retryDialog.getByRole('button', { name: 'AI 润色', exact: true }).click();
    const errorPanel = page.locator('.ai-error');
    await errorPanel.waitFor();
    assert.match(await errorPanel.innerText(), /API Key 无效或已失效/);
    await errorPanel.getByRole('button', { name: '重新填写 Key' }).click();
    const reopened = page.getByRole('dialog', { name: 'AI 设置' });
    await reopened.waitFor();
    assert.match(await reopened.innerText(), /API Key 无效或已失效，请重新填写/);

    console.log('BYOK AI browser assertions passed. DeepSeek is mocked at the browser network layer; no paid call or real database touched.');
  } finally {
    await browser?.close();
  }
});
