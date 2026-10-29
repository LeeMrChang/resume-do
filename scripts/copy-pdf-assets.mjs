import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  const target = new URL(`apps/web/public/pdfjs/${name}/`, root);
  await mkdir(target, { recursive: true });
  await cp(fileURLToPath(new URL(`node_modules/pdfjs-dist/${name}/`, root)), fileURLToPath(target), { recursive: true });
}
