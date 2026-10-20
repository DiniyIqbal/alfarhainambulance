import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: true,
    port: 5173
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        portal: resolve(__dirname, 'portal.html')
      }
    }
  }
});
