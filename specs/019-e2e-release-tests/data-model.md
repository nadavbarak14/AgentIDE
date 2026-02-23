# Data Model: E2E Release Tests

**Branch**: `019-e2e-release-tests` | **Date**: 2026-02-23

This feature does not introduce new persistent data models. The test infrastructure uses ephemeral in-memory and filesystem-based test state.

## Test Fixture Entities

### GitFixture

Represents a temporary git repository with known, deterministic changes for diff testing.

**Attributes**:
- `repoPath`: Absolute path to the temporary git repo
- `initialFiles`: Map of filename → content (committed as the initial state)
- `modifiedFiles`: Map of filename → new content (staged but uncommitted — creates the diff)
- `deletedFiles`: List of filenames removed after initial commit

**Lifecycle**: Created in test setup, destroyed in test teardown (via environment cleanup).

**State transitions**: `init` → `committed` → `modified` (with uncommitted changes visible to diff viewer)

### TestSession

Represents a session created during E2E testing for interaction.

**Attributes**:
- `id`: Session ID returned by POST /api/sessions
- `title`: Display title in session grid
- `workingDirectory`: Points to a GitFixture repoPath or a plain temp directory
- `status`: active | queued | completed

**Lifecycle**: Created via API in test setup or via UI interaction during test, killed/deleted in cleanup.

### BrowserContext

Represents the Playwright browser state shared across tests in a single worker.

**Attributes**:
- `baseURL`: Server URL (e.g., `http://127.0.0.1:12345`)
- `page`: Active Playwright page object
- `serverProcess`: Reference to the running server for cleanup

**Lifecycle**: Created in globalSetup, shared across test files, torn down in globalTeardown.

## Required data-testid Additions

These `data-testid` attributes must be added to frontend components to enable reliable E2E test selectors:

| Component | Attribute | Element |
|-----------|-----------|---------|
| SessionGrid | `data-testid="session-grid"` | Grid container |
| SessionCard | `data-testid="session-card-{id}"` | Card root (already has `data-session-id`) |
| SessionQueue | `data-testid="new-session-form"` | New session form |
| SessionQueue | `data-testid="create-session-btn"` | Create Session button |
| SessionQueue | `data-testid="session-title-input"` | Title text input |
| SessionCard toolbar | `data-testid="files-btn"` | Files panel toggle button |
| SessionCard toolbar | `data-testid="git-btn"` | Git panel toggle button |
| FileTree | `data-testid="file-tree"` | File tree container |
| FileViewer | `data-testid="file-viewer"` | Editor container |
| DiffViewer | `data-testid="diff-viewer"` | Diff container |
| DiffViewer | `data-testid="diff-file-list"` | Changed files list |
| DiffViewer | `data-testid="comment-input"` | Comment text input |
| DiffViewer | `data-testid="add-comment-btn"` | Add Comment button |
| SessionGrid | `data-testid="overflow-bar"` | More Sessions bar |
| Dashboard | `data-testid="sidebar-toggle"` | New Session / Close sidebar button |
