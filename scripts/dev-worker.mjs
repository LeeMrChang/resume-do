import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';

const root = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(root, '.env');
if (existsSync(envFile)) loadEnvFile(envFile);
// Match the API's apps/api working directory for ../../data, including when
// launched from an IDE rather than a shell that has sourced .env.
process.chdir(path.join(root, 'apps/pdf-worker'));
await import('../apps/pdf-worker/src/index.ts');
