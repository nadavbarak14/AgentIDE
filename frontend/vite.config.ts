import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { extensionsPlugin } from './vite-plugin-extensions';

export default defineConfig({
  plugins: [react(), extensionsPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3005',
      '/ws': {
        target: 'ws://localhost:3005',
        ws: true,
      },
    },
  },
});
