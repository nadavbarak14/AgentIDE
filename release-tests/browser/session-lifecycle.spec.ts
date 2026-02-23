import { test, expect, cleanupSessions, createTestSession, getServerInfo } from './fixtures.js';

test.describe('US1: Session Lifecycle', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await cleanupSessions(baseURL!);
    // Set maxVisibleSessions to 2 so 3rd session overflows
    await fetch(`${baseURL}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxVisibleSessions: 2 }),
    });
    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterEach(async ({ baseURL }) => {
    await cleanupSessions(baseURL!);
    // Restore default
    await fetch(`${baseURL}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxVisibleSessions: 4 }),
    });
  });

  test('sidebar new-session form is accessible and session created via API appears in grid', async ({ page, baseURL }) => {
    const info = getServerInfo();

    // Open sidebar and verify form elements are present
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('new-session-form')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('session-title-input')).toBeVisible();
    // Create button is disabled until title + directory are both provided
    await expect(page.getByTestId('create-session-btn')).toBeDisabled();

    // Create session via API (faster and avoids complex ProjectPicker UI)
    await createTestSession(baseURL!, { title: 'API Created Session', workingDirectory: info.dataDir });

    // Verify the new session card appears in the grid
    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(1, { timeout: 15_000 });
  });

  test('queues 3rd session when max concurrent is 2', async ({ page, baseURL }) => {
    const info = getServerInfo();

    // Create 3 sessions via API (faster than UI)
    await createTestSession(baseURL!, { title: 'Session 1', workingDirectory: info.dataDir });
    await createTestSession(baseURL!, { title: 'Session 2', workingDirectory: info.dataDir });
    await createTestSession(baseURL!, { title: 'Session 3', workingDirectory: info.dataDir });

    // Reload to see all sessions
    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    // Default max concurrent = 2, so grid should show 2 active sessions
    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(2, { timeout: 15_000 });

    // The 3rd session should be in the overflow bar
    const overflowBar = page.getByTestId('overflow-bar');
    await expect(overflowBar).toBeVisible();
  });

  test('auto-activates queued session when active session is killed', async ({ page, baseURL }) => {
    const info = getServerInfo();

    // Create 3 sessions
    await createTestSession(baseURL!, { title: 'Active 1', workingDirectory: info.dataDir });
    await createTestSession(baseURL!, { title: 'Active 2', workingDirectory: info.dataDir });
    await createTestSession(baseURL!, { title: 'Queued 3', workingDirectory: info.dataDir });

    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(2, { timeout: 15_000 });

    // Kill one active session via the X button
    const closeButton = grid.getByTestId('close-button').first();
    await closeButton.click();

    // Wait for the queued session to auto-activate (up to 20s — Claude takes time to die)
    // The grid should still have 2 sessions (one was killed, one was promoted from queue)
    await expect(grid.locator('[data-session-id]')).toHaveCount(2, { timeout: 20_000 });

    // Overflow bar should disappear (no more queued sessions)
    await expect(page.getByTestId('overflow-bar')).not.toBeVisible({ timeout: 20_000 });
  });

  test('kills session via X button and removes it from grid', async ({ page, baseURL }) => {
    const info = getServerInfo();

    // Create 1 session
    await createTestSession(baseURL!, { title: 'To Kill', workingDirectory: info.dataDir });

    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(1, { timeout: 15_000 });

    // Click X button to kill
    await grid.getByTestId('close-button').click();

    // Session should be removed from grid (Claude may take time to die after SIGTERM)
    await expect(grid.locator('[data-session-id]')).toHaveCount(0, { timeout: 30_000 });
  });

  test('shows empty state when no sessions exist', async ({ page, baseURL }) => {
    // Ensure no sessions (cleanup already ran in beforeEach)
    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    const grid = page.getByTestId('session-grid');
    await expect(grid).toBeVisible();

    // No session cards should be present
    await expect(grid.locator('[data-session-id]')).toHaveCount(0);
  });
});
