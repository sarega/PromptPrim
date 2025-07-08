import { defineConfig } from 'vite';
import packageJson from './package.json';

// https://vitejs.dev/config/
export default defineConfig({
  // Set the base path for GitHub Pages deployment.
  base: '/PromptPrim/',

  // Make the app version from package.json available to the client-side code.
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version)
  },

  // Server configuration for local development.
  server: {
    host: '0.0.0.0', // Allow access from other devices on the same network
    port: 5173,
  }
});