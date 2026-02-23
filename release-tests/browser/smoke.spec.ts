import { test, expect } from './fixtures.js';

test.describe('Browser E2E Smoke', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.goto(baseURL!);
  });

  test('dashboard page loads and renders', async ({ page }) => {
    // The page should have a title
    await expect(page).toHaveTitle(/Adyx/i);

    // The session grid area should be present
    await expect(page.getByTestId('session-grid')).toBeVisible({ timeout: 15_000 });
  });
});
