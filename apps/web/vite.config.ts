import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// Fontsource ships woff2 and woff copies of every unicode-range slice; every
// browser that runs this editor supports woff2, so drop the duplicate sources
// instead of emitting twice as many font files.
function woff2OnlyFonts(): Plugin {
  return {
    name: 'woff2-only-fonts',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@fontsource') || !id.endsWith('.css')) return;
      return code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, '');
    },
  };
}

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  // Server-side configuration only; secrets are never exposed as VITE_* variables.
  const env = { ...loadEnv(mode, root, 'RESUME_DO_'), ...process.env };
  return {
    plugins: [woff2OnlyFonts(), react()],
    server: {
      port: Number(env.RESUME_DO_WEB_PORT || 5173),
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${env.RESUME_DO_API_PORT || 8080}`,
          changeOrigin: false,
        },
      },
    },
  };
});
