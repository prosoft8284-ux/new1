import { defineConfig } from 'vite'

// The cloud workspace exposes the dev server through one preview hostname.
// Allow exactly that host (never a wildcard) so the preview can be embedded.
const previewHosts = (process.env.PREVIEW_HOST || '').split(',').map(s => s.trim()).filter(Boolean)

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000
  },
  server: {
    port: 3100,
    host: '0.0.0.0',
    allowedHosts: previewHosts
  }
})
