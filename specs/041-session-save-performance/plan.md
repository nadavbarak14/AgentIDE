# Implementation Plan: Session Save & Performance

**Branch**: `041-session-save-performance` | **Date**: 2026-03-17 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/041-session-save-performance/spec.md`

## Summary

Ensure all sessions survive any type of hub shutdown (crash, restart, update) by stopping automatic session deletion and preserving session state continuously. Improve session switching speed (target <500ms) by caching panel state and batching API calls. Improve session creation speed (target <2s) by making skill injection async.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, better-sqlite3, xterm.js 5, ws 8, chokidar 4, node-pty, Tailwind CSS 3, Vite 6
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, no schema migrations
**Testing**: Vitest 2.1.0, supertest, @testing-library/react, @testing-library/jest-dom
**Target Platform**: Windows + Linux (Node.js server + browser frontend)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Session switch <500ms, session creation <2s, scrollback loss window <500ms
**Constraints**: No new dependencies. Must work with existing tmux-based crash resilience.
**Scale/Scope**: Up to 10 concurrent sessions, single user per hub instance

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Tests planned for all changes: unit (repository, cache, debounce), integration (API contracts, crash survival), system (full crash→restart→verify cycle) |
| II. UX-First Design | PASS | Feature directly addresses user pain: session loss and slow switching. Spec has user stories with acceptance scenarios. |
| III. UI Quality & Consistency | PASS | Loading indicators required (FR-012). Recovery status shown (FR-008). No new UI components — enhancing existing SessionCard/SessionGrid. |
| IV. Simplicity | PASS | No new tables, no new dependencies. Changes are behavioral (stop deleting, add caching). Minimal new abstractions. |
| V. CI/CD Pipeline | PASS | All changes go through PR + CI. No shortcuts. |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies. |
| VII. Backend Security | PASS | No new endpoints expose sensitive data. Existing auth/validation applies. |
| VIII. Observability | PASS | Recovery events logged. WebSocket broadcasts provide observability into session state changes. |

### Post-Design Gate

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Test plan covers: (1) unit tests for cleanup logic, cache, debounce; (2) integration tests for session survival and API changes; (3) system tests for crash→recovery cycle |
| IV. Simplicity | PASS | No new DB tables. One new API endpoint (`/metadata`). In-memory LRU cache is a simple Map. Debounce is standard pattern. |
| VII. Backend Security | PASS | New `/metadata` endpoint uses existing session validation. No new auth surface. |

## Project Structure

### Documentation (this feature)

```text
specs/041-session-save-performance/
├── plan.md              # This file
├── research.md          # Phase 0: technical research
├── data-model.md        # Phase 1: schema & state changes
├── quickstart.md        # Phase 1: development guide
├── contracts/           # Phase 1: API changes
│   └── api-changes.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (files to modify)

```text
backend/
├── src/
│   ├── hub-entry.ts                    # Startup cleanup, event handlers, shutdown
│   ├── models/
│   │   └── repository.ts              # cleanupStaleSessions(), remove deleteSession from events
│   ├── services/
│   │   └── session-manager.ts         # Recovery flow improvements
│   ├── worker/
│   │   └── pty-spawner.ts             # Scrollback flush interval, async skill injection
│   └── api/
│       ├── routes/sessions.ts         # New /metadata endpoint
│       └── websocket.ts               # session_state_changed broadcast
└── tests/
    ├── unit/
    │   ├── session-preservation.test.ts     # NEW: cleanup logic tests
    │   └── session-crash-recovery.test.ts   # MODIFY: add recovery tests
    └── integration/
        ├── api-sessions.test.ts             # MODIFY: test preserved sessions
        └── api-crashed-sessions.test.ts     # MODIFY: test recovery flow

frontend/
├── src/
│   ├── hooks/
│   │   ├── usePanel.ts                # Panel state caching + auto-save
│   │   ├── useSession.ts             # Switch debouncing
│   │   └── useSessionQueue.ts        # WS broadcast listener, relaxed polling
│   └── components/
│       └── SessionCard.tsx            # Batched metadata fetch
└── tests/
    └── unit/
        └── components/
            └── session-switching.test.tsx    # NEW: cache + debounce tests
```

**Structure Decision**: Existing web application structure (backend/ + frontend/). All changes are modifications to existing files. Two new test files.

## Implementation Phases

### Phase A: Session Preservation (P1 — FR-001, FR-002, FR-007, FR-009)

**Goal**: Sessions survive any shutdown type.

1. **Repository changes** (`repository.ts`):
   - Add `cleanupStaleSessions(maxAgeDays: number)` — deletes sessions where `completed_at < now - maxAgeDays` AND status IN ('completed', 'failed')
   - Keep `deleteSession()` for explicit user deletion only

2. **Hub entry changes** (`hub-entry.ts`):
   - Replace `deleteNonActiveSessions()` with `cleanupStaleSessions(7)`
   - Remove `repo.deleteSession()` from `session_completed` and `session_failed` event handlers
   - Keep status updates (`completeSession`, `failSession`) — just don't delete

3. **Tests**: Unit test for `cleanupStaleSessions()` with various session ages. Integration test: create sessions, simulate restart, verify sessions preserved.

### Phase B: Continuous State Saving (P2 — FR-003, FR-004)

**Goal**: Minimize data loss window.

1. **Scrollback flush** (`pty-spawner.ts`):
   - Reduce `SCROLLBACK_FLUSH_INTERVAL` from 2000 to 500ms

2. **Panel auto-save** (`usePanel.ts`):
   - Add `useEffect` with 5-second debounced timer that calls `panelStateApi.save()` when state changes
   - Save on `document.visibilitychange` (tab blur)
   - Save on session switch (before switch completes)

3. **Tests**: Verify flush interval change. Frontend test for debounced save behavior.

### Phase C: Fast Session Switching (P2 — FR-005, FR-010, FR-011)

**Goal**: Switch in <500ms.

1. **Panel state cache** (`usePanel.ts`):
   - In-memory Map cache for last 5 sessions' panel state
   - On switch: check cache first, skip API call on hit
   - Invalidate on save (cache always has latest)

2. **Switch debouncing** (`useSession.ts` or `Dashboard.tsx`):
   - 100ms debounce on `handleFocusSession()`
   - Cancel pending switches when new switch requested

3. **Batched metadata** (`sessions.ts` + `SessionCard.tsx`):
   - Add `GET /api/sessions/:id/metadata` combining widgets + extensions
   - Replace two separate fetches in SessionCard with single call

4. **WebSocket broadcasts** (`websocket.ts` + `hub-entry.ts` + `useSessionQueue.ts`):
   - Broadcast `session_state_changed` on status/input changes
   - Frontend listens and updates local state immediately
   - Increase poll interval from 1s to 5s (fallback only)

5. **Tests**: Unit test for cache behavior. Integration test for metadata endpoint. Test that rapid switching debounces correctly.

### Phase D: Fast Session Creation (P3 — FR-006, FR-012)

**Goal**: Create in <2s.

1. **Async skill injection** (`pty-spawner.ts`):
   - Replace `fs.cpSync` loop with `fs.symlinkSync` (preferred) or async `fs.cp` with `{ recursive: true }`
   - If symlinks not viable (Windows), use async copy with callback

2. **Loading indicator** (already exists — verify it works):
   - Ensure SessionCard shows loading state between creation and first terminal output

3. **Tests**: Verify skill injection uses non-blocking approach. Timing test for session creation.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Symlinks don't work on Windows | Medium | Delays Phase D | Fall back to async `fs.cp` |
| Increased DB size from preserved sessions | Low | Minor | 7-day cleanup prevents unbounded growth |
| Cache staleness during concurrent edits | Low | Minor | Single-user system; invalidate on save |
| Reduced polling interval causes missed updates | Low | Medium | WS broadcast supplements; 5s poll is fallback |

## Complexity Tracking

> No constitution violations. All changes use existing patterns and infrastructure.

No entries needed.
