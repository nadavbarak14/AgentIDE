# Research: Directory Picker UX Improvements

**Feature**: 027-directory-picker-ux
**Date**: 2026-03-06

## Research Areas

### 1. Existing Directory Listing API

**Decision**: Reuse the existing `GET /api/directories?path=&query=` endpoint as-is.

**Rationale**: The API already supports:
- Listing subdirectories of any given path (defaults to home dir)
- Filtering by partial name (query parameter)
- Returns `{ path, entries: [{ name, path }], exists }` — exactly what the browser needs
- Path traversal protection (rejects `..` and null bytes)
- Results capped at 20 entries (sufficient for browsing)
- Remote worker equivalent: `GET /workers/:id/directories?path=&query=`

**Alternatives considered**:
- New dedicated "browse" endpoint: Rejected — existing endpoint provides all needed functionality
- Increase the 20-entry cap: Not needed — directories with 20+ subdirectories are rare and scroll is acceptable

### 2. Frontend Directory Browser Pattern

**Decision**: Clickable folder list with breadcrumb navigation, synced path bar, and "Select this folder" button.

**Rationale**: This is the most natural browsing pattern for a narrow sidebar (320px). It mirrors familiar file manager UX (click to enter, breadcrumb to jump back) without needing complex tree-view state management.

**Alternatives considered**:
- Tree view (expand/collapse): Rejected — too complex for 320px width, harder to implement with the API (requires lazy loading per-node)
- Modal/overlay browser: Rejected — breaks flow, heavier UI, unnecessary for directory selection

### 3. Path Abbreviation Strategy

**Decision**: Replace `abbreviatePath` with smarter `~`-based abbreviation. Show `~/` prefix for home-relative paths. For paths longer than available width, truncate from the left with `...` prefix while preserving at least the last 3 path segments. Full path always available via `title` attribute tooltip.

**Rationale**: The current `abbreviatePath` keeps only the last 2 segments, which loses critical context (e.g., `~/work/api` and `~/personal/api` both show as `.../api`). Showing 3+ segments with `~` prefix provides enough context to distinguish paths while fitting the sidebar width.

**Alternatives considered**:
- Show full path always: Rejected — overflows on long paths in 320px sidebar
- Custom tooltip component: Rejected — native `title` attribute is simpler and sufficient (Principle IV)

### 4. Browse Button Placement & Styling

**Decision**: Move "Browse" button to the top of the ProjectPicker, above the project list. Use solid border, folder icon (unicode or inline SVG), and contrasting styling.

**Rationale**: Current dashed-border button at the bottom is below the fold for users with many projects. Placing it at the top ensures discoverability. Solid border and icon make it clearly interactive (Principle III).

**Alternatives considered**:
- Keep at bottom but make more prominent: Rejected — still hidden when projects overflow
- Always-visible floating button: Rejected — over-engineered for this use case

### 5. Component Architecture

**Decision**: Enhance existing `DirectoryPicker` with a `browseMode` boolean state. When `browseMode` is true, render the visual folder browser below the path input. The path input and browser stay synced. ProjectPicker continues to control the browse/project-list toggle.

**Rationale**: Keeps changes minimal. The DirectoryPicker already manages directory state and API calls. Adding browser UI alongside the existing input is a natural extension. No new components needed.

**Alternatives considered**:
- New `DirectoryBrowser` component: Rejected — would duplicate API call logic and state management already in DirectoryPicker
- Refactor into a compound component: Rejected — unnecessary abstraction for the current scope (Principle IV)

### 6. Project List Max-Height

**Decision**: Increase from `max-h-40` (160px) to `max-h-60` (240px), showing ~6 items.

**Rationale**: 240px fits 6 project rows (40px each) without pushing the Create Session button off-screen on standard viewport heights (768px+). The form elements above the project list take ~120px, and the button/flags below take ~150px, leaving 498px for the project list in worst case.

**Alternatives considered**:
- Dynamic max-height based on viewport: Rejected — over-engineered, fixed increase is sufficient
- No max-height (auto-grow): Rejected — pushes Create button off-screen with many projects
