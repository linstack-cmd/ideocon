import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/client',
  plugins: [solid()],
  server: {
    middlewareMode: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    target: 'esnext',
    minify: true,
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
});
