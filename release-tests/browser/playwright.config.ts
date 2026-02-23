import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: path.resolve(import.meta.dirname),
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: path.resolve(import.meta.dirname, 'playwright-report') }],
  ],
  globalSetup: path.resolve(import.meta.dirname, 'global-setup.ts'),
  globalTeardown: path.resolve(import.meta.dirname, 'global-teardown.ts'),
  use: {
    headless: !process.env.HEADED,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: path.resolve(import.meta.dirname, 'test-results'),
});
