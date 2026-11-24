import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    target: 'esnext',
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), teacher: resolve(import.meta.dirname, 'teacher.html') } },
  },
  server: { port: 5173 },
});
