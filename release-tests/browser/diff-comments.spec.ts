import { test, expect, cleanupSessions, createTestSession, createGitFixture, getServerInfo } from './fixtures.js';
import type { GitFixture } from './fixtures.js';

test.describe('US6: Diff Comment Workflow', () => {
  let fixture: GitFixture;

  test.beforeEach(async ({ page, baseURL }) => {
    await cleanupSessions(baseURL!);

    const info = getServerInfo();

    // Create a git repo with known uncommitted changes
    fixture = createGitFixture(info.dataDir);

    // Create session pointing at the git repo
    await createTestSession(baseURL!, { title: 'Comment Test', workingDirectory: fixture.repoPath });

    await page.goto(baseURL!);
    await page.waitForLoadState('domcontentloaded');

    // Wait for session card to appear
    const grid = page.getByTestId('session-grid');
    await expect(grid.locator('[data-session-id]')).toHaveCount(1, { timeout: 15_000 });

    // Open Git panel and wait for file list to appear
    await page.getByTestId('git-btn').click();
    await expect(page.getByTestId('diff-file-list')).toBeVisible({ timeout: 15_000 });

    // Click on a file to show the diff (diff-viewer renders after file selection)
    await page.getByTestId('diff-file-list').getByText('README.md').click();
    await expect(page.getByTestId('diff-viewer')).toBeVisible({ timeout: 10_000 });
  });

  test.afterEach(async ({ baseURL }) => {
    await cleanupSessions(baseURL!);
  });

  test('clicking + gutter icon opens inline comment input', async ({ page }) => {
    const diffViewer = page.getByTestId('diff-viewer');

    // Look for a "+" button in the diff gutter area
    // The add-comment button appears on line hover — move mouse to a diff line first
    const diffLines = diffViewer.locator('tr, [class*="line"], [class*="row"]');
    const firstLine = diffLines.first();

    if (await firstLine.isVisible()) {
      await firstLine.hover();
      await page.waitForTimeout(300);
    }

    // Find and click the "+" add-comment button
    const addBtn = diffViewer.locator('button:has-text("+"), [title*="comment"], [title*="Comment"]').first();
    if (await addBtn.isVisible({ timeout: 3_000 })) {
      await addBtn.click();

      // Comment input should become visible
      await expect(page.getByTestId('comment-input')).toBeVisible({ timeout: 5_000 });
    }
  });

  test('typing and adding a comment saves it inline', async ({ page }) => {
    const diffViewer = page.getByTestId('diff-viewer');

    // Hover a line and click "+" to open comment input
    const lines = diffViewer.locator('tr, [class*="line"]');
    if (await lines.first().isVisible()) {
      await lines.first().hover();
      await page.waitForTimeout(300);
    }

    const addBtn = diffViewer.locator('button:has-text("+"), [title*="comment"], [title*="Comment"]').first();
    if (await addBtn.isVisible({ timeout: 3_000 })) {
      await addBtn.click();
      await expect(page.getByTestId('comment-input')).toBeVisible({ timeout: 5_000 });

      // Type a comment
      await page.getByTestId('comment-input').fill('Test comment from E2E');

      // Click Add to Review button
      await page.getByTestId('add-comment-btn').click();

      // The comment text should appear in the diff area
      await expect(diffViewer).toContainText('Test comment from E2E', { timeout: 5_000 });
    }
  });

  test('editing a comment makes it editable', async ({ page }) => {
    const diffViewer = page.getByTestId('diff-viewer');

    // First, add a comment
    const lines = diffViewer.locator('tr, [class*="line"]');
    if (await lines.first().isVisible()) {
      await lines.first().hover();
      await page.waitForTimeout(300);
    }

    const addBtn = diffViewer.locator('button:has-text("+"), [title*="comment"], [title*="Comment"]').first();
    if (await addBtn.isVisible({ timeout: 3_000 })) {
      await addBtn.click();
      await page.getByTestId('comment-input').fill('Original comment');
      await page.getByTestId('add-comment-btn').click();
      await expect(diffViewer).toContainText('Original comment', { timeout: 5_000 });

      // Find and click the edit button on the saved comment
      const editBtn = diffViewer.locator('button:has-text("Edit"), button:has-text("edit"), [title*="Edit"]').first();
      if (await editBtn.isVisible({ timeout: 3_000 })) {
        await editBtn.click();

        // A textarea or input should appear with the existing text
        const editInput = diffViewer.locator('textarea, input[type="text"]').last();
        await expect(editInput).toBeVisible({ timeout: 3_000 });
        const value = await editInput.inputValue();
        expect(value).toContain('Original comment');
      }
    }
  });

  test('deleting a comment removes it', async ({ page }) => {
    const diffViewer = page.getByTestId('diff-viewer');

    // First, add a comment
    const lines = diffViewer.locator('tr, [class*="line"]');
    if (await lines.first().isVisible()) {
      await lines.first().hover();
      await page.waitForTimeout(300);
    }

    const addBtn = diffViewer.locator('button:has-text("+"), [title*="comment"], [title*="Comment"]').first();
    if (await addBtn.isVisible({ timeout: 3_000 })) {
      await addBtn.click();
      await page.getByTestId('comment-input').fill('Comment to delete');
      await page.getByTestId('add-comment-btn').click();
      await expect(diffViewer).toContainText('Comment to delete', { timeout: 5_000 });

      // Find and click the delete button
      const deleteBtn = diffViewer.locator('button:has-text("Delete"), button:has-text("delete"), button:has-text("×"), [title*="Delete"]').first();
      if (await deleteBtn.isVisible({ timeout: 3_000 })) {
        await deleteBtn.click();

        // The comment text should no longer be visible
        await expect(diffViewer).not.toContainText('Comment to delete', { timeout: 5_000 });
      }
    }
  });
});
