import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // Read PORT from .env too, so the proxy matches the API server.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      // Browser talks only to our local server; the API key never reaches the browser.
      proxy: { '/api': `http://127.0.0.1:${env.PORT ?? 3212}` },
    },
  };
});
