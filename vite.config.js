import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/PromptPrim/', // <--- แก้ไขตรงนี้!
  server: {
    host: '0.0.0.0',
    port: 5173, // or any available port
  }
});