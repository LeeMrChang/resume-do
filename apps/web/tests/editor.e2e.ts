import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultDocument, createDefaultAppearance } from '@resume-do/schema';

// Browser regression with an isolated in-memory API. Does not touch user data.
test('A01 save/reload, A05 cancel/apply, A06 1/3/5-page preview and overflow warning', { timeout: 120_000 }, async () => {
  const base = 'http://resume-do.test';
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  // Serve the production build through Playwright routing; no TCP listener needed.
  await readFile(path.join(dist, 'index.html'));
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
    const page = await browser.newPage();
    await page.route(`${base}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith('/api/')) return route.fallback();
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(dist, relative);
      if (!file.startsWith(dist)) throw new Error('Invalid asset path');
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
    let record = {
      id: 'e2e', title: '浏览器回归', revision: 1,
      document: createDefaultDocument(), appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    record.document.sections = [{ id: 'evaluation', type: 'rich', title: '自我评价', visible: true,
      items: [{ id: 'body', title: '', role: '', startMonth: '', endMonth: '', ongoing: false, body: '<p>起始内容</p>' }] }];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      let body: unknown;
      if (url === '/api/auth/me') body = { id: 1, email: 'test@example.com', displayName: '回归测试' };
      else if (url === '/api/resumes') body = [record];
      else if (url === '/api/resumes/e2e') {
        if (request.method() === 'PATCH') {
          const payload = request.postDataJSON();
          assert.equal(payload.baseRevision, record.revision);
          record = { ...record, ...payload, revision: record.revision + 1, updatedAt: new Date().toISOString() };
        }
        body = record;
      } else throw new Error(`Unexpected API: ${url}`);
      await route.fulfill({ json: body });
    });
    await page.goto(base);
    await page.getByLabel('姓名', { exact: true }).fill('段落回归');
    await page.getByRole('tab', { name: '求职意向', exact: true }).click();
    await page.getByLabel('意向职位', { exact: true }).fill('技术文档工程师');
    await page.getByRole('tab', { name: '自我评价' }).click();
    const editor = page.getByRole('textbox', { name: '自我评价正文', exact: true });
    await editor.fill('第一行');
    await editor.press('End');
    await editor.press('Enter');
    await editor.pressSequentially('第二行');
    await editor.press('Enter');
    await editor.pressSequentially('第三行');
    await editor.blur();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    assert.match(record.document.sections[0].items[0].body, /<p>第二行<\/p>/);
    await page.reload();
    await page.getByRole('tab', { name: '自我评价' }).click();
    assert.deepEqual(await editor.locator('p').allTextContents(), ['第二行', '第三行']);
    assert.ok((await editor.innerText()).startsWith('第一行'));
    assert.equal(record.document.basic.name, '段落回归');
    assert.equal(record.document.intent.role, '技术文档工程师');
    const before = structuredClone(record);
    await page.getByRole('button', { name: /更换模板/ }).click();
    await page.getByRole('button', { name: /^1015 / }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(record, before);
    await page.getByRole('button', { name: /字体 \/ 语言/ }).click();
    await page.getByRole('slider').fill('16');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(record, before);
    await page.getByRole('button', { name: /更换模板/ }).click();
    await page.getByRole('button', { name: /^1015 / }).click();
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    await page.reload();
    await page.getByLabel('姓名', { exact: true }).waitFor();
    assert.equal(record.appearance.templateId, '1015');
    assert.deepEqual(record.document, before.document);
    await page.getByRole('button', { name: /字体 \/ 语言/ }).click();
    await page.getByRole('slider').fill('16');
    await page.getByRole('button', { name: '应用', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    await page.reload();
    await page.getByLabel('姓名', { exact: true }).waitFor();
    assert.equal(record.appearance.fontSize, 16);
    for (const target of [1, 3, 5]) {
      let low = 1, high = 240, found = false;
      while (low <= high) {
        const count = Math.floor((low + high) / 2);
        record.document.sections[0].items[0].body = Array.from({ length: count }, (_, i) => `<p>分页段落 ${i + 1}</p>`).join('');
        await page.reload();
        await page.getByLabel('姓名', { exact: true }).waitFor();
        await page.locator('.pages .r-page').first().waitFor();
        const actual = await page.locator('.pages .r-page').count();
        if (actual < target) low = count + 1;
        else if (actual > target) high = count - 1;
        else {
          found = true;
          assert.equal(await page.locator('.overflow-warning').count(), 0);
          const paragraphs = page.locator('.pages .r-paragraph');
          assert.equal(await paragraphs.count(), count);
          for (const content of await page.locator('.pages .r-content').allTextContents()) assert.ok(content.trim());
          assert.ok(await page.locator('.pages .r-content').evaluateAll(contents => contents.every(content => {
            const bounds = content.getBoundingClientRect();
            return Array.from(content.children).every(block => {
              const box = block.getBoundingClientRect();
              return box.bottom <= bounds.bottom + 1 && box.right <= bounds.right + 1 && box.left >= bounds.left - 1;
            });
          })), 'Preview blocks must fit within the page content area');
          break;
        }
      }
      assert.ok(found, `Could not build ${target} pages`);
    }
    record.document.sections[0].items[0].body = `<p>${'超长单段内容'.repeat(1000)}</p>`;
    await page.reload();
    await page.locator('.overflow-warning').waitFor();
    console.log('Browser assertions passed; A06 line splitting remains unsupported. API is mocked; no real PDF download tested.');
  } finally {
    await browser?.close();
  }
});
