import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultDocument, createDefaultAppearance } from '@resume-do/schema';

test('rich text toolbar, markdown shortcuts and inline image', { timeout: 120_000 }, async () => {
  const base = 'http://localhost:4198';
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  await readFile(path.join(dist, 'index.html'));
  const pixel = fileURLToPath(new URL('./fixtures/pixel.png', import.meta.url));

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

    let record = {
      id: 'e2e', title: '富文本回归', revision: 1,
      document: createDefaultDocument(), appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const evaluation = record.document.sections.find((section) => section.id === 'evaluation')!;
    evaluation.items[0].body = '<p>起始内容</p>';
    const currentBody = () => record.document.sections.find((section) => section.id === 'evaluation')!.items[0].body;

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
    await page.locator('.resume-card .card-open').first().click();
    await page.getByRole('tab', { name: '自我评价' }).click();
    const editor = page.getByRole('textbox', { name: '自我评价正文', exact: true });
    await editor.waitFor();

    await editor.click();
    await editor.fill('');
    await editor.pressSequentially('**加粗**');
    await page.waitForFunction(() => document.querySelector('[aria-label="自我评价正文"] strong')?.textContent === '加粗');
    assert.doesNotMatch(await editor.innerHTML(), /\*\*/);

    await page.keyboard.press('Enter');
    await editor.pressSequentially('格式测试');
    await page.evaluate(() => {
      const target = document.querySelector('[aria-label="自我评价正文"]');
      if (!target) throw new Error('editor missing');
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        const index = node.data.indexOf('格式测试');
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 4);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }
      throw new Error('format text not found');
    });
    await page.getByLabel('字号', { exact: true }).selectOption('18px');
    await page.getByRole('button', { name: '文字颜色', exact: true }).click();
    await page.getByRole('button', { name: '颜色 #e5484d', exact: true }).click();
    await page.getByRole('button', { name: '居中', exact: true }).click();
    await page.waitForFunction(() => {
      const target = document.querySelector('[aria-label="自我评价正文"]');
      return Boolean(
        target?.querySelector('span[style*="font-size: 18px"]') &&
        target.querySelector('span[style*="color: #e5484d"]') &&
        target.querySelector('[style*="text-align: center"]'),
      );
    });

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await editor.pressSequentially('- 第一项');
    await page.waitForFunction(() => document.querySelector('[aria-label="自我评价正文"] ul li')?.textContent === '第一项');
    await page.keyboard.press('Enter');
    await editor.pressSequentially('第二项');
    assert.deepEqual(await editor.locator('ul li').allTextContents(), ['第一项', '第二项']);

    await page.locator('input[type=file][accept*="image/png"]').setInputFiles(pixel);
    await page.waitForFunction(() => Boolean(document.querySelector('[aria-label="自我评价正文"] img[src^="data:image/"]')));

    await page.getByRole('tab', { name: '基本信息', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();

    const saved = currentBody();
    assert.match(saved, /<strong>加粗<\/strong>/);
    assert.match(saved, /font-size:\s*18px/);
    assert.match(saved, /color:\s*#e5484d/);
    assert.match(saved, /text-align:\s*center/);
    assert.match(saved, /<ul><li>[^]*第一项[^]*第二项/);
    assert.match(saved, /<img[^>]+src="data:image\/(?:webp|png|jpeg);base64,/);
    assert.match(saved, /width="1"/);
    assert.match(saved, /height="1"/);

    await page.reload();
    await page.locator('.resume-card .card-open').first().click();
    await page.getByRole('tab', { name: '自我评价' }).click();
    await page.waitForFunction(() => Boolean(document.querySelector('.pages img[src^="data:image/"]')));
    await page.waitForFunction(() => document.querySelector('[aria-label="自我评价正文"] strong')?.textContent === '加粗');
    assert.equal(await page.locator('[aria-label="自我评价正文"] img').count(), 1);
  } finally {
    await browser?.close();
  }
});
