import { test, expect, cleanupSessions, createTestSession, createGitFixture, getServerInfo } from './fixtures.js';
import type { GitFixture } from './fixtures.js';

test.describe('US3: Git Diff Viewer', () => {
  let fixture: GitFixture;

  test.beforeEach(async ({ page, baseURL }) => {
    await cleanupSessions(baseURL!);

    const info = getServerInfo();

    // Create a git repo with known uncommitted changes
    fixture = createGitFixture(info.dataDir);

    // Create session pointing at the git repo
    await createTestSession(baseURL!, { title: 'Git Diff Test', workingDirectory: fixture.repoPath });

    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    // Wait for session card to appear
    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(1, { timeout: 15_000 });
  });

  test.afterEach(async ({ baseURL }) => {
    await cleanupSessions(baseURL!);
  });

  test('opens Git panel and shows changed files', async ({ page }) => {
    // Click Git button
    await page.getByTestId('git-btn').click();

    // File list should appear (diff-file-list is always visible once Git panel opens)
    const fileList = page.getByTestId('diff-file-list');
    await expect(fileList).toBeVisible({ timeout: 15_000 });
    await expect(fileList).toContainText('README.md', { timeout: 5_000 });
    await expect(fileList).toContainText('index.ts', { timeout: 5_000 });
  });

  test('clicking a changed file shows side-by-side diff', async ({ page }) => {
    // Open Git panel and wait for file list
    await page.getByTestId('git-btn').click();
    await expect(page.getByTestId('diff-file-list')).toBeVisible({ timeout: 15_000 });

    // Click on README.md in the file list — this triggers the diff-viewer to render
    await page.getByTestId('diff-file-list').getByText('README.md').click();

    // The diff should show side-by-side content
    const diffViewer = page.getByTestId('diff-viewer');

    // Should contain old content (left side)
    await expect(diffViewer).toContainText('Original content', { timeout: 5_000 });
    // Should contain new content (right side)
    await expect(diffViewer).toContainText('Updated content', { timeout: 5_000 });
  });

  test('additions shown in green, deletions in red', async ({ page }) => {
    // Open Git panel and wait for file list
    await page.getByTestId('git-btn').click();
    await expect(page.getByTestId('diff-file-list')).toBeVisible({ timeout: 15_000 });

    // Click on README.md to load the diff
    await page.getByTestId('diff-file-list').getByText('README.md').click();
    await page.waitForTimeout(1000); // Wait for diff to render

    const diffViewer = page.getByTestId('diff-viewer');

    // Check for green-tinted elements (additions) — look for CSS classes with 'green'
    const addedElements = diffViewer.locator('[class*="green"]');
    await expect(addedElements.first()).toBeVisible({ timeout: 5_000 });

    // Check for red-tinted elements (deletions) — look for CSS classes with 'red'
    const deletedElements = diffViewer.locator('[class*="red"]');
    await expect(deletedElements.first()).toBeVisible({ timeout: 5_000 });
  });
});
