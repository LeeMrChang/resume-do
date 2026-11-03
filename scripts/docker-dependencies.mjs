// Project the existing npm lock into a Docker input containing only one service.
// No resolution or downloads: keep the locked versions, URLs, integrity and nesting.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function project(root, service) {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  if (lock.lockfileVersion !== 3) throw new Error('Expected npm lockfileVersion 3');
  const packages = lock.packages;
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8'));
  const selected = new Set();
  const workspaces = new Set();
  const manifests = {};
  const resolve = (from, name) => {
    let parent = from;
    for (;;) {
      const candidate = path.posix.join(parent, 'node_modules', name);
      if (packages[candidate]) return candidate;
      if (!parent) return undefined;
      parent = path.posix.dirname(parent);
      if (parent === '.') parent = '';
      if (path.posix.basename(parent) === 'node_modules') parent = path.posix.dirname(parent);
      if (parent === '.') parent = '';
    }
  };
  const visit = (location) => {
    if (selected.has(location)) return;
    const entry = packages[location];
    if (!entry) throw new Error(`Missing locked package: ${location}`);
    selected.add(location);
    if (entry.link) {
      if (!packages[entry.resolved] || !/^(apps|packages)\//.test(entry.resolved)) {
        throw new Error(`Unsupported local dependency: ${location}`);
      }
      visit(entry.resolved);
      return;
    }
    const workspace = location && !location.split('/').includes('node_modules');
    if (workspace) {
      workspaces.add(location);
      manifests[`${location}/package.json`] = read(location);
    }
    const deps = { ...entry.dependencies, ...entry.optionalDependencies, ...entry.peerDependencies,
      ...(workspace || !location ? entry.devDependencies : {}) };
    for (const name of Object.keys(deps)) {
      const dependency = resolve(location, name);
      if (dependency) visit(dependency);
      else if (!(name in (entry.optionalDependencies ?? {})) && !entry.peerDependenciesMeta?.[name]?.optional) {
        throw new Error(`Missing locked dependency ${name} of ${location || 'root'}`);
      }
    }
  };

  let manifest;
  if (service === 'browser') {
    // A separate input keeps Chromium stable when application dependencies change.
    const location = resolve('apps/pdf-worker', 'playwright');
    if (location !== 'node_modules/playwright') throw new Error('Expected root-hoisted Playwright');
    manifest = { name: 'resume-do-browser', version: '0.1.0', private: true,
      dependencies: { playwright: packages[location].version } };
    visit(location);
  } else {
    const workspace = { web: 'apps/web', worker: 'apps/pdf-worker' }[service];
    if (!workspace) throw new Error(`Unknown service: ${service}`);
    visit('');
    visit(resolve('', packages[workspace].name));
    manifest = { ...read(''), workspaces: [...workspaces].sort() };
  }
  const projected = { ...lock, name: manifest.name, version: manifest.version,
    packages: { '': service === 'browser' ? manifest : { ...packages[''], workspaces: manifest.workspaces } } };
  for (const location of [...selected].sort()) {
    if (location) projected.packages[location] = packages[location];
  }
  manifests['package.json'] = manifest;
  manifests['package-lock.json'] = projected;
  return manifests;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [service, output] = process.argv.slice(2);
  if (!output) throw new Error('Usage: node scripts/docker-dependencies.mjs web|worker|browser OUTPUT');
  const files = project(process.cwd(), service);
  for (const [name, value] of Object.entries(files)) {
    const destination = path.join(output, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, JSON.stringify(value, null, 2) + '\n');
  }
  console.log(`${service}: ${Object.keys(files['package-lock.json'].packages).length - 1} locked packages`);
}
