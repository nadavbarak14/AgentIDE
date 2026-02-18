# Implementation Plan: UX Polish — Inline Comments Round 2

**Branch**: `004-ux-polish` | **Date**: 2026-02-18 | **Spec**: `specs/004-ux-polish/spec.md`
**Input**: Feature specification from `/specs/004-ux-polish/spec.md`

## Summary

Round 2 of UX polish focuses on 5 changes to the inline comment system: (1) enable commenting on both old AND new columns in DiffViewer with correct code snippet extraction, (2) capture exact selected text as code snippet, (3) add Monaco zone widgets in FileViewer for inline comment display with edit/delete, (4) use the same full textarea for editing as for adding, (5) add `side` column to track which column a comment belongs to. US2 (overflow amber) and US3 (unsaved guard) remain done from previous rounds.

**Current state**: Backend comment CRUD is implemented. DiffViewer has inline comments with edit/delete (but only on new column). FileViewer has decorations only (no inline text). Code snippet extraction prefers new column content (bug). Edit UI uses small inline input (should be full textarea).

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, @monaco-editor/react 4.6 (Monaco view zones), diff2html 3.4, Express 4, better-sqlite3
**Storage**: SQLite (better-sqlite3) — one schema change: `ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new'`
**Testing**: Vitest 2.1.0 (frontend: jsdom environment, backend: node environment)
**Target Platform**: Web (modern browsers)
**Project Type**: Web application (backend + frontend)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Tests will be updated for new behavior: side field, zone widgets, both-column commenting |
| II. UX-First Design | PASS | GitHub-style inline comments; zone widgets match proven UX pattern |
| III. UI Quality & Consistency | PASS | Same textarea UI for edit and add; consistent across both viewers |
| IV. Simplicity | PASS | Modifying existing components; one new DB column; no new abstractions |
| V. CI/CD Pipeline | PASS | Will push branch + PR after implementation |
| VI. Frontend Plugin Quality | PASS | No new dependencies; Monaco view zones are a built-in API |
| VII. Backend Security | PASS | Backend validates `side` field; existing auth unchanged |
| VIII. Observability | PASS | Backend logging already in place for comment operations |

## Project Structure

### Documentation (this feature)

```text
specs/004-ux-polish/
├── plan.md              # This file
├── research.md          # Technical decisions (9 decisions)
├── data-model.md        # Comment entity with new `side` column
├── quickstart.md        # Verification steps for all stories
└── tasks.md             # Task breakdown
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   └── repository.ts       # MODIFY: add `side` to createComment, getComments
│   └── api/routes/
│       └── sessions.ts         # MODIFY: accept `side` in create comment endpoint
└── tests/
    ├── unit/comments.test.ts   # MODIFY: test `side` field
    └── integration/api-sessions.test.ts  # MODIFY: test `side` in API

frontend/
├── src/
│   ├── components/
│   │   ├── DiffViewer.tsx      # MODIFY: both-column gutter, fix snippet, edit textarea, side tracking
│   │   ├── FileViewer.tsx      # MODIFY: add Monaco zone widgets for inline comments
│   │   └── SessionGrid.tsx     # DONE: amber overflow background
│   └── services/
│       └── api.ts              # MODIFY: add `side` to CommentData and CreateCommentInput
└── tests/
    └── unit/v9-ux-polish.test.ts  # UPDATE: tests for new behavior
```

**Structure Decision**: Existing web application structure. No new files — all changes are modifications to existing components.

## Implementation Approach

### What's Already Done (from previous implementation rounds)

- **Backend**: `updateComment()`, `deleteComment()` in repository.ts
- **Backend**: PUT/DELETE endpoints in sessions.ts routes
- **Frontend API**: `comments.update()`, `comments.delete()` in api.ts
- **US2**: Amber `bg-amber-500/20` on collapsed overflow bar (SessionGrid.tsx)
- **US3**: Unsaved close confirmation with Discard/Cancel (FileViewer.tsx)
- **DiffViewer**: Inline comments with edit/delete controls (but new column only)
- **DiffViewer**: Floating "Comment" button for text selection
- **DiffViewer**: Gutter "+" for adding comments (but new column only)
- **FileViewer**: Comment creation (selection + floating button), Monaco decorations, Send All button

### What Needs to Change (Round 2)

#### 1. Backend: Add `side` column to comments

- **repository.ts**: `ALTER TABLE` migration in `initDb()`, update `createComment()` to accept and store `side`, update `getComments()` to return `side`
- **sessions.ts**: Update POST comment endpoint to accept optional `side` field (default `'new'`)
- **api.ts**: Add `side` to `CommentData` and `CreateCommentInput` types

#### 2. DiffViewer: Enable both-column commenting

- **Remove `select-none`** from left DiffCell content div (was added in round 1)
- **Enable "+" gutter on left column**: Currently `onPlusClick` is passed as `null` for left DiffCell. Pass a handler that records `side='old'`
- **Track comment side**: Add state to track which side the user is commenting from. Pass `side` to `commentsApi.create()`
- **Fix code snippet extraction**: When creating from gutter, extract from `pair.left.content` (old) or `pair.right.content` (new) based on which side was clicked
- **Fix text selection snippet**: When floating Comment button is clicked, capture `window.getSelection().toString()` as the exact code snippet
- **Display comments on correct side**: Match `side='old'` comments against `pair.left?.lineNumber`, `side='new'` against `pair.right?.lineNumber`

#### 3. DiffViewer: Edit UI → full textarea

- Replace the small inline `<input>` for editing with the same full `<textarea>` block used for adding comments. Pre-fill with existing text. Save/Cancel buttons.

#### 4. FileViewer: Monaco zone widgets

- **Add zone widget management**: After comments load, use `editor.changeViewZones()` to inject HTML below commented lines
- **Zone widget DOM**: Each zone contains: Pending badge, comment text, edit button, delete button
- **Zone widget edit mode**: Clicking edit replaces the zone content with a textarea + Save/Cancel
- **Zone widget lifecycle**: Create/update/remove zones when `existingComments` changes. Dispose on unmount.
- **Keep decorations**: Yellow glyph margin decorations remain as visual indicators alongside zone widgets

## Complexity Tracking

| Decision | Why Needed | Simpler Alternative Rejected Because |
|----------|------------|-------------------------------------|
| `side` column on comments | Distinguish old vs new column for correct line matching in diff | Matching against both columns is ambiguous when old line N ≠ new line N in diff rows |
| Monaco zone widgets | Inline comments inside editor matching DiffViewer UX | Decorations alone don't show comment text; panel below disconnects comments from code |
