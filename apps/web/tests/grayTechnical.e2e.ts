import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { SAMPLE_DOCUMENT, createDefaultAppearance } from '@resume-do/schema';
import { buildBlocks, getPageMetrics, paginateBlocks, renderMeasureHtml, renderPagesHtml } from '@resume-do/templates';

test('gray technical template can be selected and saved, wraps personal details and shares export pagination', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const base = 'http://localhost:4198';
    const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
    const record = {
      id: 'gray-test', title: '技术模板回归', revision: 1,
      document: structuredClone(SAMPLE_DOCUMENT), appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    record.document.moduleDefaultsApplied = true;
    record.document.basic.customFields = [{ label: 'GitHub', value: 'github.com/' + 'long-profile-name'.repeat(6) }];
    const work = record.document.sections.find(section => section.id === 'work')!;
    work.items[0].body += '<p>跨页技术经历与项目说明，验证正文完整保留。</p>'.repeat(65);
    const original = structuredClone(record.document);
    await page.route(`${base}/**`, async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.startsWith('/api/')) return route.fallback();
      const file = path.resolve(dist, pathname === '/' ? 'index.html' : pathname.slice(1));
      if (!file.startsWith(dist + path.sep)) throw new Error('Invalid asset path');
      const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
      await route.fulfill({ body: await readFile(file), contentType: types[path.extname(file)] || 'application/octet-stream' });
    });
    await page.route('**/api/**', async route => {
      const request = route.request(), pathname = new URL(request.url()).pathname;
      if (pathname === '/api/auth/me') return route.fulfill({ json: { id: 99, displayName: '模板测试', themePreference: 'light' } });
      if (pathname === '/api/resumes') return route.fulfill({ json: [record] });
      if (pathname === '/api/template-favorites') return route.fulfill({ json: [] });
      if (pathname === '/api/resumes/gray-test') {
        if (request.method() === 'PATCH') Object.assign(record, request.postDataJSON(), { revision: record.revision + 1 });
        return route.fulfill({ json: record });
      }
      throw new Error(`Unexpected API ${pathname}`);
    });
    await page.goto(base);
    await page.locator('.resume-card .card-open').first().click();
    await page.getByRole('button', { name: '更换模板', exact: true }).click();
    const modal = page.getByRole('dialog', { name: '更换模板', exact: true });
    await modal.getByRole('searchbox').fill('灰阶技术');
    await modal.getByRole('button', { name: '2170 灰阶技术', exact: true }).click();
    await modal.getByRole('button', { name: '应用', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    assert.equal(record.appearance.templateId, '2170');
    assert.deepEqual(record.document, original, 'switching template preserves content');
    await page.locator('.pages .tpl-2170').first().waitFor();
    const previewPages = await page.locator('.pages .r-page').count();
    assert.ok(previewPages > 1);
    assert.equal(await page.locator('.pages .r-footer, .pages .r-intro-photo').count(), 0);
    const geometry = await page.locator('.pages .r-page').first().evaluate(node => {
      const grid = node.querySelector<HTMLElement>('.r-personal-grid')!;
      const title = node.querySelector<HTMLElement>('.r-personal-title')!;
      const heading = node.querySelector<HTMLElement>('.r-technical-heading')!;
      const name = heading.querySelector('h1')!.getBoundingClientRect();
      const intent = heading.querySelector('.r-intent')!.getBoundingClientRect();
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        background: getComputedStyle(title).backgroundColor,
        radius: getComputedStyle(title).borderRadius,
        overflow: grid.scrollWidth > grid.clientWidth + 1,
        nameBeforeIntent: name.right <= intent.left,
      };
    });
    assert.deepEqual(geometry, { columns: 3, background: 'rgb(232, 232, 232)', radius: '0px', overflow: false, nameBeforeIntent: true });
    await page.screenshot({ path: '/tmp/resume-do-gray-technical-editor.png', fullPage: true });

    const input = { document: record.document, appearance: record.appearance };
    const blocks = buildBlocks(input);
    const exportPage = await browser.newPage();
    await exportPage.setContent(renderMeasureHtml(input, blocks));
    await exportPage.evaluate(() => document.fonts.ready);
    const heights = await exportPage.locator('[data-block]').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
    const result = paginateBlocks(blocks, heights, getPageMetrics(input.appearance).contentHeightPx);
    assert.deepEqual(result.overflow, []);
    assert.equal(result.pages.length, previewPages);
    const html = renderPagesHtml(input, result.pages.map(indices => indices.map(index => blocks[index])));
    await exportPage.setContent(html);
    await exportPage.evaluate(() => document.fonts.ready);
    assert.equal(await exportPage.locator('[data-block]').count(), blocks.length);
    assert.equal(await exportPage.locator('.r-footer').count(), 0);
    const clipped = await exportPage.locator('.r-content').evaluateAll(nodes => nodes.some(node => node.scrollHeight > node.clientHeight + 1));
    assert.equal(clipped, false);
    await exportPage.pdf({ path: '/tmp/resume-do-gray-technical.pdf', printBackground: true, preferCSSPageSize: true });
    await exportPage.locator('.r-page').first().screenshot({ path: '/tmp/resume-do-gray-technical-page.png' });
  } finally {
    await browser.close();
  }
});
