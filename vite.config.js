import { resolve } from 'path'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
// import tailwindcss from 'tailwindcss';
import packageJson from './package.json';

import { cloudflare } from "@cloudflare/vite-plugin";

function normalizeBasePath(rawValue = '/') {
  const normalizedValue = String(rawValue || '/').trim();
  if (!normalizedValue || normalizedValue === '/') return '/';
  const withLeadingSlash = normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function resolvePublicBasePath() {
  const explicitBasePath = process.env.VITE_PUBLIC_BASE_PATH;
  if (explicitBasePath) {
    return normalizeBasePath(explicitBasePath);
  }

  return '/';
}

const htmlEntryPoints = {
  index: resolve(__dirname, 'index.html'),
  app: resolve(__dirname, 'app.html'),
  auth: resolve(__dirname, 'auth.html'),
  admin: resolve(__dirname, 'admin.html'),
};

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()], 
  server: {
    host: '0.0.0.0', // For local/LAN access
    port: 5173,
    proxy: {
      '/ollama-api': {
        target: 'http://localhost:11434',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ollama-api/, '/api'),
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: htmlEntryPoints,
    },
  },
  base: resolvePublicBasePath(),
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  },
});