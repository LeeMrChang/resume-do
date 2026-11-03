import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { project } from '../docker-dependencies.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const original = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

test('each service installs its own dependency closure with original integrity and nested versions', () => {
  const web = project(root, 'web')['package-lock.json'].packages;
  const worker = project(root, 'worker')['package-lock.json'].packages;
  assert.ok(web['node_modules/pdfjs-dist']);
  assert.ok(web['node_modules/@fontsource/noto-sans-sc']);
  assert.equal(web['node_modules/playwright'], undefined);
  assert.equal(web['apps/pdf-worker'], undefined);
  assert.ok(worker['node_modules/playwright']);
  assert.ok(worker['node_modules/mysql2']);
  assert.equal(worker['node_modules/@fontsource/noto-sans-sc'], undefined);
  assert.equal(worker['node_modules/react'], undefined);
  assert.equal(worker['apps/web'], undefined);
  for (const packages of [web, worker]) {
    for (const [location, entry] of Object.entries(packages)) {
      if (location) assert.deepEqual(entry, original.packages[location], location);
    }
    assert.ok(Object.keys(packages).some((name) => /node_modules\/.*\/node_modules\//.test(name)));
  }
});

test('browser version and integrity come from exactly the worker Playwright lock', () => {
  const files = project(root, 'browser');
  assert.deepEqual(Object.keys(files['package-lock.json'].packages).sort(),
    ['', 'node_modules/playwright', 'node_modules/playwright-core']);
  assert.equal(files['package.json'].dependencies.playwright, original.packages['node_modules/playwright'].version);
  assert.deepEqual(files['package-lock.json'].packages['node_modules/playwright-core'],
    original.packages['node_modules/playwright-core']);
});

test('changing only web font dependencies preserves worker and browser cache inputs', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-deps-'));
  try {
    for (const name of ['', 'apps/web', 'apps/pdf-worker', 'packages/schema', 'packages/templates']) {
      fs.mkdirSync(path.join(temporary, name), { recursive: true });
      fs.copyFileSync(path.join(root, name, 'package.json'), path.join(temporary, name, 'package.json'));
    }
    const changed = structuredClone(original);
    changed.packages['node_modules/@fontsource/noto-sans-sc'].version = '99.0.0';
    changed.packages['apps/web'].dependencies['@fontsource/noto-sans-sc'] = '99.0.0';
    const web = JSON.parse(fs.readFileSync(path.join(temporary, 'apps/web/package.json'), 'utf8'));
    web.dependencies['@fontsource/noto-sans-sc'] = '99.0.0';
    fs.writeFileSync(path.join(temporary, 'apps/web/package.json'), JSON.stringify(web));
    fs.writeFileSync(path.join(temporary, 'package-lock.json'), JSON.stringify(changed));
    assert.deepEqual(project(temporary, 'worker'), project(root, 'worker'));
    assert.deepEqual(project(temporary, 'browser'), project(root, 'browser'));
    assert.notDeepEqual(project(temporary, 'web'), project(root, 'web'));
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
