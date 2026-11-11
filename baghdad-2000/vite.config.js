import { defineConfig } from 'vite';

// Preview/dev proxy hostnames come from the environment, never from tracked
// config, so a specific VM hostname is not written into the repository.
const extraHosts = (process.env.PREVIEW_HOSTS || '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    allowedHosts: extraHosts.length ? extraHosts : undefined,
  },
  build: {
    target: 'es2020',
  },
});
