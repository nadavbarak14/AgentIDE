# Tasks: UX Polish — Inline Comments Round 2

**Input**: Design documents from `/specs/004-ux-polish/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- All paths relative to repository root: `/home/ubuntu/projects/ClaudeQueue`

## Already Completed (from previous implementation rounds)

The following work is **done** and does not need re-implementation:

- **Backend**: `updateComment()` and `deleteComment()` in `backend/src/models/repository.ts`
- **Backend**: PUT and DELETE comment endpoints in `backend/src/api/routes/sessions.ts`
- **Frontend API**: `comments.update()` and `comments.delete()` in `frontend/src/services/api.ts`
- **Backend tests**: Unit tests in `backend/tests/unit/comments.test.ts`, integration tests in `backend/tests/integration/api-sessions.test.ts`
- **DiffViewer**: Inline comments with edit/delete controls (new column only), floating "Comment" button, gutter "+", Send All
- **FileViewer**: Comment creation (selection + floating button), Monaco decorations, Send All button, unsaved close guard
- **US2 (Overflow amber)**: `bg-amber-500/20` on collapsed overflow bar in `frontend/src/components/SessionGrid.tsx`
- **US3 (Unsaved guard)**: Close confirmation with Discard/Cancel in `frontend/src/components/FileViewer.tsx`

---

## Phase 1: Setup

**Purpose**: No setup needed — all infrastructure is in place from previous rounds.

*Phase skipped — proceed to Phase 2.*

---

## Phase 2: Foundational (Backend `side` column + API types)

**Purpose**: Add the `side` column to the comments table and update API types. This MUST complete before frontend US1 work because the frontend needs to send and receive the `side` field.

- [X] T001 [P] Add `side` column to comments table and update repository methods in backend/src/models/repository.ts — in the `initDb()` method, add `ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new'` (wrapped in try/catch since column may already exist). Update `createComment()` to accept a `side` parameter (default `'new'`) and include it in the INSERT. Update `getComments()` and `getCommentsByStatus()` to return the `side` column in results.
- [X] T002 [P] Accept `side` field in POST create comment endpoint in backend/src/api/routes/sessions.ts — in the `POST /:id/comments` handler, extract `side` from `req.body` (default `'new'`, validate it's `'old'` or `'new'`), and pass it to `repo.createComment()`.
- [X] T003 [P] Add `side` field to CommentData and CreateCommentInput types in frontend/src/services/api.ts — add `side: 'old' | 'new'` to the `CommentData` interface and `side?: 'old' | 'new'` (optional, defaults to 'new') to `CreateCommentInput`. Update `comments.create()` to include `side` in the POST body.

**Checkpoint**: Backend accepts and returns `side` field. Frontend API client sends `side`. Existing comments default to `side='new'`.

---

## Phase 3: User Story 1 — Both-Column Inline Comments + FileViewer Zone Widgets (Priority: P1) 🎯

**Goal**: Comments work on both old and new columns in DiffViewer with correct code snippets. FileViewer shows inline comments via Monaco zone widgets. Edit UI uses full textarea. No summary strips.

**Independent Test**: Open DiffViewer → click "+" on both old and new columns → comments appear inline with correct text from each column → edit uses full textarea → Send All delivers correct text. Open FileViewer → zone widgets show comments below lines with edit/delete.

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [X] T004 [P] [US1] Update backend unit tests for `side` field in backend/tests/unit/comments.test.ts — add tests: createComment with `side='old'` stores correctly, createComment defaults to `side='new'`, getComments returns `side` field, getCommentsByStatus returns `side` field
- [X] T005 [P] [US1] Update backend integration tests for `side` in API in backend/tests/integration/api-sessions.test.ts — add tests: POST create comment with `side='old'` returns comment with side='old', POST create without side defaults to 'new', invalid side value returns 400
- [X] T006 [P] [US1] Update frontend tests in frontend/tests/unit/v9-ux-polish.test.ts — replace/add tests for: side-aware comment display (old-side comments match left line numbers, new-side match right), code snippet extraction from correct column based on side, exact selected text capture, edit UI uses full textarea (editingCommentId triggers textarea not input), zone widget rendering logic (comments grouped by line for zone display), no summary strip rendered

### Implementation for User Story 1

#### DiffViewer changes (sequential — same file, dependent changes)

- [X] T007 [US1] Enable both-column commenting in DiffViewer in frontend/src/components/DiffViewer.tsx — (1) Remove `select-none` class from the left DiffCell content div (line with `${side === 'left' ? ' select-none' : ''}`). (2) Add `commentSide` state: `const [commentSide, setCommentSide] = useState<'old' | 'new'>('new')`. (3) In the `SideBySideDiff` component, enable "+" gutter on the LEFT `DiffCell` by passing an `onPlusClick` handler instead of `null`. The left handler sets `commentSide='old'`, the right handler sets `commentSide='new'`. Add `onPlusClickLeft` prop or modify the existing `onGutterPlusClick` to accept a side parameter. (4) Pass `commentSide` to `SideBySideDiff` as a prop, and pass it into `commentsApi.create()` call as `side: commentSide` in the `handleAddComment` function.
- [X] T008 [US1] Fix code snippet extraction to use correct column in frontend/src/components/DiffViewer.tsx — (1) In `handleAddComment`, replace the current snippet extraction that uses `pair.right?.content ?? pair.left?.content` with side-aware extraction: if `commentSide === 'old'`, use `pair.left?.content ?? ''`; if `commentSide === 'new'`, use `pair.right?.content ?? ''`. (2) For text selection comments (floating Comment button), capture `window.getSelection()?.toString()` as the exact code snippet instead of the line-range reconstruction. Store the selection text in a ref or state when the floating button appears, and use it in `handleAddComment`.
- [X] T009 [US1] Display comments on correct side based on `side` field in frontend/src/components/DiffViewer.tsx — update the `lineComments` filter in `SideBySideDiff` (currently `existingComments.filter(c => c.filePath === filePath && c.startLine === lineNum)`) to be side-aware: `existingComments.filter(c => c.filePath === filePath && ((c.side === 'old' && c.startLine === pair.left?.lineNumber) || (c.side === 'new' && c.startLine === (pair.right?.lineNumber ?? 0))))`. This ensures old-side comments only match old column line numbers and new-side comments only match new column line numbers.
- [X] T010 [US1] Replace edit inline input with full textarea in DiffViewer in frontend/src/components/DiffViewer.tsx — in the `SideBySideDiff` inline comment rendering, replace the small `<input type="text">` for editing (the `editingCommentId === c.id` branch) with the same full `<textarea>` block used for adding comments: multi-line textarea (rows={3}), "Comment on line X" label, Save and Cancel buttons. Pre-fill with `editCommentText`. The Save button calls `onEditSave(c.id)`, Cancel calls `onEditCancel()`.

#### FileViewer changes

- [X] T011 [US1] Add Monaco zone widgets for inline comment display with edit/delete in frontend/src/components/FileViewer.tsx — (1) Add a `useEffect` that runs when `existingComments` changes: call `editor.changeViewZones(accessor => { ... })` to create/update/remove view zones. For each pending comment, create a DOM node with: Pending badge, comment text, edit button (triggers `editingCommentId` state), delete button (calls `commentsApi.delete` and removes from array). Use `{ afterLineNumber: c.endLine, heightInPx: 60, domNode }` for each zone. Track zone IDs in a ref for cleanup. (2) For edit mode inside zone widgets: when `editingCommentId` matches a comment, the zone node contains a textarea pre-filled with comment text + Save/Cancel buttons (heightInPx increases to ~120 for the textarea). (3) Style zone nodes with dark theme classes (bg-gray-800, border-blue-500, text matching existing inline style). (4) Keep existing Monaco decorations (yellow glyph margin) alongside zone widgets. (5) Clean up all zones on component unmount or file change.

### Checkpoint

Comments can be placed on both old and new columns in DiffViewer. Code snippets come from the correct column. Edit uses full textarea. FileViewer shows inline comments via zone widgets with edit/delete. No summary strips in either viewer. US2 (overflow amber) and US3 (unsaved guard) still working.

---

## Phase 4: User Story 2 — Bold Overflow Indicator (Priority: P2) ✅ DONE

**Status**: Already implemented in previous round. `bg-amber-500/20` on collapsed overflow bar button in `frontend/src/components/SessionGrid.tsx`. Tests passing.

---

## Phase 5: User Story 3 — Unsaved File Close Confirmation (Priority: P2) ✅ DONE

**Status**: Already implemented in previous round. `pendingCloseTab` state with Discard/Cancel prompt in `frontend/src/components/FileViewer.tsx`. Tests passing.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate all stories work together, ensure quality gates pass.

- [X] T012 Run full test suite: `npm test` from repository root — all existing + new tests must pass
- [X] T013 Run linting and type checking: `npm run lint` — fix any lint or type errors
- [X] T014 Rebuild frontend and backend, restart server, verify all stories manually per quickstart.md
- [ ] T015 Push branch, create PR to main via `gh pr create`, rebase-merge after CI green (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Skipped — already done
- **Foundational (Phase 2)**: No dependencies — backend `side` column + API types
- **US1 (Phase 3)**: Depends on Phase 2 (needs `side` field in API)
- **US2 (Phase 4)**: Already complete
- **US3 (Phase 5)**: Already complete
- **Polish (Phase 6)**: Depends on US1 being complete

### Task Dependencies within US1

- **T004, T005, T006**: Independent — test files, can run in parallel with each other and with T001-T003
- **T007**: Depends on T003 (needs `side` in API types) — enables both-column gutter + side tracking
- **T008**: Depends on T007 — uses `commentSide` state for correct snippet extraction
- **T009**: Depends on T007 — uses `side` field for display matching
- **T010**: Independent of T007-T009 — replaces edit UI (same file but different code section)
- **T011**: Independent of T007-T010 — different file (FileViewer.tsx), depends on T003 for `side` type

### Parallel Opportunities

- **T001, T002, T003**: All in parallel (different files)
- **T004, T005, T006**: All in parallel (different test files)
- **T007 and T011**: Could run in parallel after T003 (different frontend files)
- **T008-T010**: Must be sequential after T007 (same file, dependent changes)

---

## Implementation Strategy

### Execution Order

1. T001 + T002 + T003 — in parallel (backend + API types)
2. T004 + T005 + T006 — in parallel (tests)
3. T007 (enable both-column gutter + side state) + T011 (FileViewer zone widgets) — in parallel
4. T008 (fix snippet extraction)
5. T009 (side-aware display)
6. T010 (edit textarea)
7. T012-T014 (polish: test, lint, build)
8. T015 (push + PR)

---

## Notes

- No new npm dependencies needed
- One database schema change: `ALTER TABLE comments ADD COLUMN side TEXT DEFAULT 'new'`
- Backend comment CRUD (update/delete) is fully implemented and tested
- The `commentSide` state tracks which column the user is currently commenting from
- Monaco `changeViewZones` API is used for FileViewer inline comments — zone IDs tracked for lifecycle management
- Zone widget DOM nodes use plain DOM manipulation (not React rendering) for simplicity inside Monaco
- The `select-none` CSS on the left column (added in round 1) is REMOVED since both columns are now commentable
- The small inline `<input>` for editing (added in round 1) is REPLACED with a full textarea block
- FileViewer keeps: comment creation (floating button, inline input), Monaco decorations (yellow glyph margin), Send All button, unsaved close guard
- FileViewer adds: zone widgets for inline comment display with edit/delete
- DiffViewer keeps: inline comment display, comment creation (gutter +, text selection), Send All button
- DiffViewer changes: both-column gutter, side-aware snippet extraction, side-aware display, full textarea edit
