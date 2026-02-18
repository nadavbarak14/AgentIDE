import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/vite-env.d.ts'],
      thresholds: {
        lines: 0,
        branches: 46,
        functions: 0,
        statements: 0,
      },
    },
  },
});
