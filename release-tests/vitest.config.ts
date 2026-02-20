import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    root: path.resolve(import.meta.dirname),
    include: ['**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: 'forks',
    sequence: {
      concurrent: false,
    },
  },
});
