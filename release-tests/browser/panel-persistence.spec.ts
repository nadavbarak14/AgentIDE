import fs from 'node:fs';
import path from 'node:path';
import { test, expect, cleanupSessions, createTestSession, getServerInfo } from './fixtures.js';

test.describe('US5: Panel State Persistence', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await cleanupSessions(baseURL!);

    // Ensure sidebar is closed: panels need ~500px per card, sidebar (320px)
    // steals width making 2-card layout too narrow (480px each) for panels to open.
    // Set localStorage BEFORE navigating so sidebar starts closed.
    await page.goto(baseURL!);
    await page.evaluate(() => localStorage.setItem('c3-sidebar-open', 'false'));

    const info = getServerInfo();

    // Create two directories with files so file panel has content
    const dirA = path.join(info.dataDir, `panel-test-a-${Date.now()}`);
    const dirB = path.join(info.dataDir, `panel-test-b-${Date.now()}`);
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.writeFileSync(path.join(dirA, 'fileA.txt'), 'Content from A');
    fs.writeFileSync(path.join(dirB, 'fileB.txt'), 'Content from B');

    // Create two sessions
    await createTestSession(baseURL!, { title: 'Session A', workingDirectory: dirA });
    await createTestSession(baseURL!, { title: 'Session B', workingDirectory: dirB });

    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(2, { timeout: 15_000 });
  });

  test.afterEach(async ({ baseURL }) => {
    await cleanupSessions(baseURL!);
  });

  test('panel state preserved across session switches', async ({ page }) => {
    const grid = page.getByTestId('session-grid');
    const cards = grid.locator('[data-session-id]');

    // Click session A and open Files panel
    await cards.first().click();
    await page.getByTestId('files-btn').first().click();
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 10_000 });

    // Switch to session B — file tree should disappear
    await cards.last().click();
    await page.waitForTimeout(500);
    // On session B, file panel should not be open (we didn't open it)

    // Switch back to session A — file tree should reappear
    await cards.first().click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 5_000 });
  });

  test('each session maintains independent panel state', async ({ page }) => {
    const grid = page.getByTestId('session-grid');
    const cards = grid.locator('[data-session-id]');

    // Open Git panel on session A
    await cards.first().click();
    await page.getByTestId('git-btn').first().click();

    // Wait a moment for the panel to open
    await page.waitForTimeout(500);

    // Switch to session B — don't open any panels
    await cards.last().click();
    await page.waitForTimeout(500);

    // Switch back to session A — Git panel should still be open
    await cards.first().click();
    await page.waitForTimeout(500);

    // Verify by checking Git button is in "active" state (has blue styling)
    const gitBtn = page.getByTestId('git-btn').first();
    const gitBtnClasses = await gitBtn.getAttribute('class');
    expect(gitBtnClasses).toContain('blue');
  });

  test('panel state survives page refresh', async ({ page, baseURL }) => {
    const grid = page.getByTestId('session-grid');
    const cards = grid.locator('[data-session-id]');

    // Open Files panel on session A
    await cards.first().click();
    await page.getByTestId('files-btn').first().click();
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 10_000 });

    // Refresh the page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Wait for sessions to load
    await expect(page.getByTestId('session-grid').locator('[data-session-id]')).toHaveCount(2, { timeout: 15_000 });

    // File tree should still be visible on session A
    // (need to click session A first since page refresh may reset current session)
    await page.getByTestId('session-grid').locator('[data-session-id]').first().click();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 5_000 });
  });
});
