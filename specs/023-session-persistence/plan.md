# Implementation Plan: Session Persistence & Crash Recovery

**Branch**: `023-session-persistence` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/023-session-persistence/spec.md`

## Summary

Ensure sessions survive hub crashes. Remote sessions are wrapped in tmux on the remote worker so the Claude process stays alive when the hub's SSH connection drops; on restart the hub reconnects and reattaches. Local sessions preserve their terminal scrollback so users can review what happened. Clean shutdowns continue to auto-delete sessions (feature 021 behavior unchanged). A `hub_status` flag in the settings table distinguishes crash from intentional stop.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, better-sqlite3, node-pty, ws 8, ssh2, Tailwind CSS 3, Vite 6
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `sessions` table (add `crash_recovered_at` column), existing `settings` table (add `hub_status` key)
**Testing**: Vitest 2.1.0, supertest, @testing-library/react; release tests with Vitest (forks pool)
**Target Platform**: Linux server (Node.js)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Session recovery within 30 seconds of hub restart; no more than 2 seconds added to startup when no recovery needed
**Constraints**: Scrollback files at most 5 seconds stale; tmux required on remote workers
**Scale/Scope**: Supports recovering up to 10+ concurrent sessions across multiple remote workers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit, integration, and system tests planned for all recovery paths. Real SQLite databases used. |
| II. UX-First Design | PASS | Crashed sessions shown with clear status, scrollback viewable, one-click dismiss. |
| III. UI Quality & Consistency | PASS | New `crashed` status uses amber color, consistent with existing status indicators. |
| IV. Simplicity | PASS | Minimal changes: one new status value, one settings flag, tmux wrapping for remote. No new abstractions. |
| V. CI/CD Pipeline | PASS | Feature branch, PR workflow, tests in CI. |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies. |
| VII. Backend Security | PASS | No new endpoints expose sensitive data. Scrollback endpoint only returns data for existing sessions. |
| VIII. Observability & Logging | PASS | Crash detection, recovery attempts, tmux reattachment all logged with structured context. |

### Post-Design Re-check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Tests cover: crash detection, session status transitions, scrollback preservation, clean shutdown, remote tmux lifecycle, API endpoints for crashed sessions |
| IV. Simplicity | PASS | No new tables, no new abstractions. One migration (add column), one settings key, tmux wrapping in remote bridge. |
| VII. Backend Security | PASS | tmux session names use sanitized session IDs (first 8 chars of UUID). No shell injection risk. |

## Project Structure

### Documentation (this feature)

```text
specs/023-session-persistence/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research decisions
├── data-model.md        # Phase 1: schema changes
├── quickstart.md        # Phase 1: implementation guide
├── contracts/           # Phase 1: API contracts
│   └── session-recovery-api.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── db.ts                    # Migration: add crash_recovered_at column
│   │   ├── repository.ts           # New methods: markSessionsCrashed(), listCrashedSessions()
│   │   └── types.ts                # SessionStatus: add 'crashed'
│   ├── services/
│   │   └── session-manager.ts      # Crash recovery logic, reattach remote sessions
│   ├── worker/
│   │   └── remote-pty-bridge.ts    # tmux wrapping for spawn, reattach method
│   ├── api/
│   │   ├── routes/sessions.ts      # Scrollback endpoint, crashed session handling
│   │   └── websocket.ts            # session_recovering broadcast
│   └── hub-entry.ts                # Crash detection, hub_status flag, recovery orchestration
└── tests/
    ├── unit/
    │   ├── crash-detection.test.ts       # hub_status flag logic
    │   ├── session-crash-recovery.test.ts # status transitions
    │   └── tmux-commands.test.ts          # tmux command generation
    ├── integration/
    │   ├── api-crashed-sessions.test.ts   # API endpoints for crashed sessions
    │   └── scrollback-api.test.ts         # Scrollback retrieval
    └── system/
        └── crash-recovery.test.ts         # Full recovery simulation

frontend/
├── src/
│   ├── components/
│   │   ├── SessionGrid.tsx          # Show crashed sessions
│   │   └── SessionCard.tsx          # Crashed status indicator, dismiss button
│   └── hooks/
│       └── useSessionQueue.ts       # Include crashed sessions in polling
```

**Structure Decision**: Web application (backend + frontend). All changes modify existing files — no new source files except test files.

## Complexity Tracking

No constitution violations. All changes are minimal and additive to existing structures.
