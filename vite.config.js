import { resolve } from 'path'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react'
// import tailwindcss from 'tailwindcss';
import packageJson from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()], 
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
      input: {
        // หน้าหลัก (/) จะเป็น Landing Page
        main: resolve(__dirname, 'index.html'), 
        // หน้าแอป (/app.html) คือแอปตัวเดิม
        app: resolve(__dirname, 'app.html'), 
        // หน้าแอดมินยังคงเหมือนเดิม
        admin: resolve(__dirname, 'admin.html'),
      }
    },
  },
  base: '/PromptPrim/',
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  },
});
