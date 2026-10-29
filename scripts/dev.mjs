import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
for (const [name, args] of [
  ['Web', ['node_modules/vite/bin/vite.js', 'apps/web']],
  ['PDF worker', ['--watch', '--import', 'tsx', 'scripts/dev-worker.mjs']],
]) {
  console.log(`Starting ${name}; start the Java API separately.`);
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('error', error => { console.error(`${name} failed to start`, error.message); stop(1); });
  child.on('exit', code => { if (!stopping) { console.error(`${name} exited (${code})`); stop(code || 1); } });
}
