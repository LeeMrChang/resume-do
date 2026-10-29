import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  // Server-side configuration only; secrets are never exposed as VITE_* variables.
  const env = { ...loadEnv(mode, root, 'RESUME_DO_'), ...process.env };
  return {
    plugins: [react()],
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
