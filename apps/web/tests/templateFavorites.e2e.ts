import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultDocument, createDefaultAppearance } from '@resume-do/schema';

// Isolated API; favorites survive page reloads in this mock, with no real account or database.
test('starred templates persist independently of selection and combine with search and style filters', { timeout: 90_000 }, async () => {
  const browser = await chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
  try {
    const base = 'http://localhost:4198';
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const dist = path.resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
    const favorites = new Set<string>();
    let failLoad = true, failChange = false, patches = 0;
    const record = {
      id: 'favorite-test', title: '收藏回归', revision: 1,
      document: createDefaultDocument(), appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    record.document.basic.name = '收藏回归';
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
      if (pathname === '/api/auth/me') return route.fulfill({ json: { id: 99, displayName: '收藏测试', themePreference: 'dark' } });
      if (pathname === '/api/resumes') return route.fulfill({ json: [record] });
      if (pathname === '/api/resumes/favorite-test') {
        if (request.method() === 'PATCH') {
          patches++;
          Object.assign(record, request.postDataJSON(), { revision: record.revision + 1 });
        }
        return route.fulfill({ json: record });
      }
      if (pathname === '/api/template-favorites') {
        return failLoad ? route.fulfill({ status: 503, json: { message: 'test unavailable' } }) : route.fulfill({ json: [...favorites] });
      }
      if (pathname.startsWith('/api/template-favorites/')) {
        if (failChange) return route.fulfill({ status: 503, json: { message: 'test unavailable' } });
        const id = pathname.split('/').at(-1)!;
        if (request.method() === 'PUT') favorites.add(id); else if (request.method() === 'DELETE') favorites.delete(id);
        else throw new Error('Unexpected method');
        return route.fulfill({ status: 204 });
      }
      throw new Error(`Unexpected API ${pathname}`);
    });
    const open = async () => {
      await page.getByRole('button', { name: '更换模板', exact: true }).click();
      return page.getByRole('dialog', { name: '更换模板', exact: true });
    };
    await page.goto(base);
    await page.locator('.resume-card .card-open').first().click();
    let modal = await open();
    await modal.getByRole('alert').filter({ hasText: '收藏加载失败' }).waitFor();
    assert.ok(await modal.getByRole('button', { name: '收藏模板 1045 极简蓝线', exact: true }).isDisabled());
    failLoad = false;
    await modal.getByRole('button', { name: '重新加载收藏', exact: true }).click();
    const star = modal.getByRole('button', { name: '收藏模板 1015 深海侧栏', exact: true });
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[aria-label="收藏模板 1015 深海侧栏"]')?.disabled);
    failChange = true;
    await star.click();
    await modal.getByRole('alert').filter({ hasText: '收藏失败' }).waitFor();
    assert.equal(await star.getAttribute('aria-pressed'), 'false');
    failChange = false;
    await star.click();
    await modal.getByRole('button', { name: '取消收藏模板 1015 深海侧栏', exact: true }).waitFor();
    assert.equal(await modal.getByRole('button', { name: '1015 深海侧栏', exact: true }).getAttribute('aria-pressed'), 'false');
    assert.equal(patches, 0, 'starring must not apply a template or modify a resume');
    await modal.getByRole('button', { name: '取消', exact: true }).click();
    assert.ok(favorites.has('1015'), 'cancel does not undo a saved favorite');
    await page.reload();
    await page.locator('.resume-card .card-open').first().click();
    modal = await open();
    await modal.getByRole('button', { name: '我的收藏（1）', exact: true }).click();
    assert.equal(await modal.locator('.template-card').count(), 1);
    await modal.getByRole('button', { name: '极简黑白', exact: true }).click();
    await modal.getByText('没有匹配的模板', { exact: true }).waitFor();
    await modal.getByRole('button', { name: '全部', exact: true }).click();
    const search = modal.getByRole('searchbox');
    await search.fill('不存在的模板');
    await modal.getByText('没有匹配的模板', { exact: true }).waitFor();
    await search.fill('1015');
    assert.equal(await modal.locator('.template-card').count(), 1);
    await modal.getByRole('button', { name: '取消收藏模板 1015 深海侧栏', exact: true }).click();
    await modal.getByText('还没有收藏模板', { exact: true }).waitFor();
    assert.equal(favorites.size, 0);
    await modal.getByRole('button', { name: '浏览全部模板', exact: true }).click();
    await modal.getByRole('button', { name: '1015 深海侧栏', exact: true }).click();
    await modal.getByRole('button', { name: '应用', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '已保存' }).waitFor();
    assert.equal(record.appearance.templateId, '1015', 'normal apply behavior is unchanged');
  } finally { await browser.close(); }
});
