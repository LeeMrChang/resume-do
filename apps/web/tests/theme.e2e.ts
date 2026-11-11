import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createDefaultDocument, createDefaultAppearance } from '@resume-do/schema';

const base = 'http://localhost:4198';
const dist = fileURLToPath(new URL('../dist/', import.meta.url));

async function serveBuild(page: import('playwright').Page) {
  await readFile(path.join(dist, 'index.html'));
  await page.route(`${base}/**`, async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.startsWith('/api/')) return route.fallback();
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.resolve(dist, relative);
    if (!file.startsWith(dist)) throw new Error('Invalid asset path');
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
    };
    await route.fulfill({
      body: await readFile(file),
      contentType: types[path.extname(file)] || 'application/octet-stream',
    });
  });
}

function launch() {
  return chromium.launch({ channel: process.env.RESUME_DO_BROWSER_CHANNEL || 'chrome', headless: true });
}

test('theme switch defaults to dark, persists per user, follows the system and keeps the paper white', { timeout: 120_000 }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await serveBuild(page);
    await page.emulateMedia({ colorScheme: 'light' });

    const record = {
      id: 'e2e',
      title: '主题回归',
      templateId: createDefaultAppearance().templateId,
      revision: 1,
      document: createDefaultDocument(),
      appearance: createDefaultAppearance(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    record.document.basic.name = '主题回归';
    let serverTheme: 'light' | 'dark' | 'system' = 'dark';
    const patches: Array<{ themePreference: string }> = [];

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url()).pathname;
      if (url === '/api/template-favorites') return route.fulfill({ json: [] });
      let body: unknown;
      if (url === '/api/auth/me') {
        if (request.method() === 'PATCH') {
          const payload = request.postDataJSON();
          patches.push(payload);
          serverTheme = payload.themePreference;
        }
        body = { id: 1, email: 'test@example.com', displayName: '主题回归', themePreference: serverTheme };
      } else if (url === '/api/resumes') {
        body = [record];
      } else if (url === '/api/resumes/e2e') {
        if (request.method() === 'PATCH') {
          const payload = request.postDataJSON();
          record.revision += 1;
          record.document = payload.document;
          record.appearance = payload.appearance;
        }
        body = record;
      } else {
        throw new Error(`Unexpected API: ${url}`);
      }
      await route.fulfill({ json: body });
    });

    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    const preference = () => page.evaluate(() => document.documentElement.dataset.themePreference);
    const stored = () => page.evaluate(() => window.localStorage.getItem('resume-do:theme'));
    const toggle = (name: string) => page.locator(`.theme-toggle button[aria-label="${name}"]`);
    const computed = (selector: string, property: string) =>
      page.evaluate(
        ([sel, prop]) => {
          const node = document.querySelector(sel);
          if (!node) throw new Error(`Missing ${sel}`);
          return getComputedStyle(node).getPropertyValue(prop);
        },
        [selector, property],
      );
    const waitForComputed = (selector: string, property: string, value: string) =>
      page.waitForFunction(
        ([sel, prop, expected]) => {
          const node = document.querySelector(sel);
          if (!node) return false;
          return getComputedStyle(node).getPropertyValue(prop) === expected;
        },
        [selector, property, value],
      );
    const patchResponse = () =>
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/auth/me' && response.request().method() === 'PATCH',
      );

    await page.goto(base);
    await page.locator('.app-shell .topbar').waitFor();
    await page.locator('.resume-card .card-open').first().click();
    await page.locator('.canvas').waitFor();

    // THM-D1: a first-time visitor gets dark even when the OS prefers light.
    assert.equal(await theme(), 'dark');
    assert.equal(await preference(), 'dark');
    assert.equal(await stored(), 'dark');
    assert.equal(await page.locator('.theme-toggle button[aria-pressed="true"]').getAttribute('aria-label'), '深色');

    // Paper invariant and boundaries in dark mode.
    assert.equal(await computed('.pages .r-page', 'background-color'), 'rgb(255, 255, 255)');
    assert.equal(await computed('.canvas', 'background-color'), 'rgb(17, 24, 29)');
    assert.equal(await computed('.app-shell .topbar', 'background-color'), 'rgb(36, 43, 50)');
    assert.equal(await computed('body', 'color'), 'rgb(237, 241, 243)');
    await page.screenshot({ path: '/tmp/resume-do-theme-dark.png' });

    // Dialogs and template thumbnails stay readable and keep white paper.
    await page.getByRole('button', { name: '更换模板' }).click();
    await page.locator('.dialog').waitFor();
    await page.locator('.template-thumbnail').first().waitFor();
    assert.equal(await computed('.modal', 'background-color'), 'rgba(1, 4, 9, 0.7)');
    assert.equal(await computed('.dialog', 'background-color'), 'rgb(36, 43, 50)');
    assert.equal(await computed('.template-thumbnail', 'background-color'), 'rgb(255, 255, 255)');
    await page.screenshot({ path: '/tmp/resume-do-theme-dialog-dark.png' });
    await page.locator('.dialog .close').click();

    // Switching persists locally and on the server.
    const firstPatch = patchResponse();
    await toggle('浅色').click();
    await firstPatch;
    assert.equal(await theme(), 'light');
    assert.equal(await preference(), 'light');
    assert.equal(await stored(), 'light');
    assert.deepEqual(patches, [{ themePreference: 'light' }]);
    await waitForComputed('.canvas', 'background-color', 'rgb(246, 248, 250)');
    await waitForComputed('body', 'color', 'rgb(31, 35, 40)');
    assert.equal(await computed('.pages .r-page', 'background-color'), 'rgb(255, 255, 255)');
    await page.screenshot({ path: '/tmp/resume-do-theme-light.png' });

    await page.reload();
    await page.locator('.app-shell .topbar').waitFor();
    assert.equal(await theme(), 'light');
    assert.equal(await preference(), 'light');
    assert.equal(await stored(), 'light');
    assert.equal(await toggle('浅色').getAttribute('aria-pressed'), 'true');

    // System mode reacts to the OS preference without another reload.
    const systemPatch = patchResponse();
    await toggle('跟随系统').click();
    await systemPatch;
    assert.equal(await preference(), 'system');
    assert.equal(await stored(), 'system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await preference(), 'system');

    await toggle('深色').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await preference(), 'dark');
  } finally {
    await browser.close();
  }
});

test('first paint uses the stored theme before the session request resolves', { timeout: 60_000 }, async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await serveBuild(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('resume-do:theme', 'light');
      } catch {
        // Ignore storage failures in the probe.
      }
    });
    await page.route('**/api/**', async (route) => {
      if (new URL(route.request().url()).pathname === '/api/auth/me') {
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await route.fulfill({
          status: 401,
          json: { code: 'UNAUTHORIZED', message: '请先登录', details: {} },
        });
        return;
      }
      await route.fulfill({ json: [] });
    });

    await page.goto(base, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.themePreference), 'light');

    await page.locator('.login-shell').waitFor({ timeout: 10_000 });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal((await page.locator('.login-brand').textContent())?.replace(/\s+/g, ''), '简ResumeDo');
    assert.equal((await page.locator('.login-pill').count()), 0);
    assert.equal((await page.locator('.login-title').textContent())?.trim(), '登录你的账号');
    assert.equal(await page.locator('.login-card .login-logo').isVisible(), true);
    await page.screenshot({ path: '/tmp/resume-do-theme-login-light.png' });

    await page.locator('.theme-toggle button[aria-label="深色"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.waitForFunction(() => {
      const card = document.querySelector('.login-card');
      if (!card) return false;
      return getComputedStyle(card).backgroundColor === 'rgb(36, 43, 50)';
    });
    await page.screenshot({ path: '/tmp/resume-do-theme-login-dark.png' });
  } finally {
    await browser.close();
  }
});
