import fs from 'node:fs';
import path from 'node:path';
import { test, expect, cleanupSessions, createTestSession, getServerInfo } from './fixtures.js';

test.describe('US2: File Browser & Editor', () => {
  let testDir: string;

  test.beforeEach(async ({ page, baseURL }) => {
    await cleanupSessions(baseURL!);

    const info = getServerInfo();

    // Create a directory with known files
    testDir = path.join(info.dataDir, `file-test-${Date.now()}`);
    fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(testDir, 'README.md'), '# Test Project\n\nThis is a test file.\n');
    fs.writeFileSync(path.join(testDir, 'src', 'index.ts'), 'export function hello() {\n  return "hello";\n}\n');

    // Create session pointing at this directory
    await createTestSession(baseURL!, { title: 'File Browser Test', workingDirectory: testDir });

    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    // Wait for session card to appear
    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(1, { timeout: 15_000 });
  });

  test.afterEach(async ({ baseURL }) => {
    await cleanupSessions(baseURL!);
    // Clean up test directory
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  test('opens Files panel and displays file tree', async ({ page }) => {
    // Click Files button
    await page.getByTestId('files-btn').click();

    // File tree should become visible
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 10_000 });

    // Known files should appear in the tree
    await expect(page.getByTestId('file-tree')).toContainText('README.md', { timeout: 5_000 });
    await expect(page.getByTestId('file-tree')).toContainText('src', { timeout: 5_000 });
  });

  test('clicking a file opens it in the editor', async ({ page }) => {
    // Open Files panel
    await page.getByTestId('files-btn').click();
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 10_000 });

    // Click on README.md in the file tree
    await page.getByTestId('file-tree').getByText('README.md').click();

    // Editor should become visible
    await expect(page.getByTestId('file-viewer')).toBeVisible({ timeout: 10_000 });

    // Editor should contain the file content
    // Monaco editor renders content in a specific way, check for presence
    await expect(page.getByTestId('file-viewer')).toContainText('Test Project', { timeout: 5_000 });
  });

  test('closing Files panel collapses it', async ({ page }) => {
    // Open Files panel
    await page.getByTestId('files-btn').click();
    await expect(page.getByTestId('file-tree')).toBeVisible({ timeout: 10_000 });

    // Click Files button again to toggle off
    await page.getByTestId('files-btn').click();

    // File tree should no longer be visible
    await expect(page.getByTestId('file-tree')).not.toBeVisible({ timeout: 5_000 });
  });
});
