# Tasks: Localhost Direct Iframe Preview (FR-015)

**Input**: Design documents from `/specs/014-remote-preview-proxy/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md
**Scope**: FR-015 only — localhost direct iframe. All remote agent work deferred.

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies.

**Organization**: Single user story (FR-015), minimal phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = localhost direct iframe)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup

**Purpose**: No setup needed — all infrastructure exists. Skip to implementation.

(No tasks — existing codebase is ready.)

---

## Phase 2: User Story 1 - Localhost Direct Iframe (Priority: P1) MVP

**Goal**: When the hub is accessed via localhost and the session runs on a local worker, the preview iframe points directly at `http://localhost:<port>/` with no proxy, URL rewriting, or script injection.

**Independent Test**: Start a dev server on port 3000. Access hub via `http://localhost:3001`. Open preview — iframe `src` should be `http://localhost:3000/` (not `/api/sessions/:id/proxy/3000/`). Access hub via public IP — iframe `src` should use the proxy URL (existing behavior).

### Implementation for User Story 1

- [x] T001 [US1] Pass `isLocalSession` prop from SessionCard to LivePreview in `frontend/src/components/SessionCard.tsx` — compute `isLocalSession` by looking up `session.workerId` in `workers` array and checking `worker.type === 'local'` (default to true when no worker found), pass as new prop to `<LivePreview>`
- [x] T002 [US1] Add `isLocalSession` prop to LivePreview component interface in `frontend/src/components/LivePreview.tsx` — add `isLocalSession?: boolean` to component props
- [x] T003 [US1] Modify `toProxyUrl()` in `frontend/src/components/LivePreview.tsx` — add `isLocalDirect` parameter; when true AND URL matches `localhost`/`127.0.0.1`, return the original URL unchanged instead of converting to proxy URL; compute `isLocalDirect` from `isLocalSession && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')`
- [x] T004 [US1] Update iframe `onLoad` handler in `frontend/src/components/LivePreview.tsx` — handle direct localhost URLs in the address bar display logic (lines ~127-153); when iframe src is a direct `http://localhost:port/path` URL, display it as-is in the address bar (currently only extracts from proxy URL pattern)

**Checkpoint**: Localhost direct iframe works. Preview loads dev server directly when accessed via localhost with a local session.

---

## Phase 3: Tests (MANDATORY per Constitution Principle I)

**Purpose**: Verify localhost direct iframe behavior and no regressions

- [x] T005 [P] [US1] Write unit tests for `toProxyUrl()` in `frontend/tests/unit/toProxyUrl.test.ts` — test: (a) with `isLocalDirect=true` and localhost URL → returns original URL, (b) with `isLocalDirect=false` and localhost URL → returns proxy URL, (c) with `isLocalDirect=true` and `project://` URL → still returns serve URL (not affected), (d) with `isLocalDirect=true` and external `https://` URL → still returns proxy-url (not affected)
- [x] T006 [P] [US1] Write system test for direct iframe behavior in `backend/tests/system/localhost-direct-iframe.test.ts` — start hub on localhost, start a simple HTTP server on a random port, verify that preview API response for local session does NOT go through proxy route when accessed via localhost; verify proxy route still works when accessed via non-localhost

**Checkpoint**: Tests pass, confirming direct iframe for localhost and proxy for remote access.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and merge

- [x] T007 Run full test suite and lint — `npm test && npm run lint` — fix any failures
- [ ] T008 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (Implementation)**: No dependencies — can start immediately
- **Phase 3 (Tests)**: Depends on Phase 2 (T001-T004)
- **Phase 4 (Polish)**: Depends on Phase 3

### Within Phase 2

- T001 (SessionCard prop) and T002 (LivePreview interface) → T003 (toProxyUrl logic) → T004 (onLoad handler)
- T001 and T002 can run in parallel (different files)

### Parallel Opportunities

- **Phase 2**: T001 and T002 parallel (different files)
- **Phase 3**: T005 and T006 parallel (different test files)

---

## Implementation Strategy

### MVP (All Tasks)

This feature IS the MVP — only 4 implementation tasks + 2 test tasks + 2 polish tasks.

1. T001 + T002 in parallel → T003 → T004 → Implementation done
2. T005 + T006 in parallel → Tests done
3. T007 → T008 → Merged

### Total: 8 tasks

---

## Notes

- Frontend-only change — no backend modifications
- Proxy route (`/api/sessions/:id/proxy/:port/*`) remains unchanged for remote access
- Inspect bridge not available in direct iframe mode (acceptable — users have DevTools for localhost)
- `isLocalDirect` is computed on every render but is trivially cheap (hostname check + worker type check)
- The proxy route still handles requests from remote IP access — this change only affects the iframe `src` URL generated by the frontend
