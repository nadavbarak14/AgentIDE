import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/system/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
