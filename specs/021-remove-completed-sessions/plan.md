# Implementation Plan: Remove Completed Sessions

**Branch**: `021-remove-completed-sessions` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-remove-completed-sessions/spec.md`

## Summary

Auto-delete sessions when they complete or fail. Instead of keeping completed/failed sessions in the database, the system deletes them (and all associated data) immediately after the completion/failure event fires. The frontend removes sessions from state upon receiving completion/failure WebSocket events. On startup, any stale non-active sessions are cleaned up. No new UI elements needed — the feature is purely about removing data retention of non-active sessions.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, better-sqlite3, ws 8, Tailwind CSS 3, Vite 6
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `sessions` table, no schema changes
**Testing**: Vitest 2.1.0, supertest, @testing-library/react
**Target Platform**: Linux server (web application)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Session cleanup < 1 second after completion
**Constraints**: Cleanup must not block the completion event broadcast; scrollback file errors must not prevent session deletion
**Scale/Scope**: 1-50 active sessions; cleanup touches sessions + 5 cascade tables + scrollback files per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Integration test for auto-deletion on complete/fail; startup cleanup test |
| II. UX-First Design | PASS | Eliminates clutter automatically — zero user effort |
| III. UI Quality & Consistency | PASS | Removes dead UI elements (Continue button, Completed sidebar section) |
| IV. Simplicity | PASS | Simplest possible approach — delete on completion, no new endpoints or UI |
| V. CI/CD Pipeline | PASS | Standard PR workflow |
| VI. Frontend Plugin Quality | PASS | No new dependencies |
| VII. Backend Security | PASS | No new auth surface; reuses existing delete logic |
| VIII. Observability | PASS | Log session deletion count at startup; warn on scrollback cleanup failures |

No violations. Re-check after Phase 1: PASS.

## Project Structure

### Documentation (this feature)

```text
specs/021-remove-completed-sessions/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── api.md
└── tasks.md
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   └── repository.ts          # Add deleteNonActiveSessions() for startup cleanup
│   ├── services/
│   │   └── session-manager.ts     # Add auto-delete after completeSession()/failSession()
│   └── hub-entry.ts               # Add startup cleanup call
└── tests/
    └── integration/
        └── api-sessions.test.ts   # Add auto-deletion tests

frontend/
├── src/
│   ├── components/
│   │   ├── SessionCard.tsx        # Remove "Continue" button for completed sessions
│   │   └── SessionQueue.tsx       # Remove "Completed" section from sidebar
│   ├── hooks/
│   │   └── useSessionQueue.ts     # Remove session from state on completion/failure WS events
│   └── services/
│       └── api.ts                 # No changes needed
└── tests/
```

**Structure Decision**: Existing web application structure (backend/ + frontend/). All changes modify existing files — no new files.

## Complexity Tracking

No violations to justify.
