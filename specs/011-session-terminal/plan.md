# Implementation Plan: Session Terminal

**Branch**: `011-session-terminal` | **Date**: 2026-02-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-session-terminal/spec.md`

## Summary

Add an optional shell terminal panel to sessions in ClaudeQueue. Users can open a general-purpose bash/zsh terminal alongside the Claude terminal, appearing as a separate panel below the Claude terminal (consistent with the existing panel system). The shell PTY runs in the session's working directory, persists scrollback across view switches, and is cleaned up when the session suspends or completes.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: node-pty (existing), xterm.js 5 (existing), ws 8 (existing), Express 4 (existing), React 18 (existing), Tailwind CSS 3 (existing)
**Storage**: SQLite (better-sqlite3) — no schema changes; shell scrollback persisted to disk files (same pattern as Claude terminal)
**Testing**: Vitest 2.1.0, supertest, @testing-library/react
**Target Platform**: Linux, macOS (no Windows)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Shell spawn < 1s, I/O latency < 100ms, scrollback restore instant
**Constraints**: Single shell terminal per session, opt-in only, no database schema changes
**Scale/Scope**: Same as existing session count (max_concurrent_sessions setting)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for shell PTY spawner, system tests for WebSocket shell I/O, frontend component tests |
| II. UX-First Design | PASS | User workflows mapped in spec (3 user stories with acceptance scenarios) |
| III. UI Quality & Consistency | PASS | Follows existing panel system patterns (same styling, drag handles, responsive layout) |
| IV. Simplicity | PASS | Reuses existing PtySpawner patterns and panel infrastructure; no new abstractions |
| V. CI/CD Pipeline | PASS | All changes go through PR + CI |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies; reuses existing xterm.js + addons |
| VII. Backend Security | PASS | Shell runs as same user as server (no privilege escalation); input validated at WebSocket boundary |
| VIII. Observability & Logging | PASS | Shell spawn/kill/error events logged; follows existing PTY logging patterns |

No violations. All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/011-session-terminal/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── worker/
│   │   └── shell-spawner.ts         # NEW — Shell PTY spawner (simplified PtySpawner)
│   ├── services/
│   │   └── session-manager.ts       # MODIFIED — Shell lifecycle hooks (spawn/kill alongside session)
│   ├── api/
│   │   ├── websocket.ts             # MODIFIED — Add shell WebSocket channel
│   │   └── routes/
│   │       └── sessions.ts          # MODIFIED — Add shell open/close/status endpoints
│   └── models/
│       └── types.ts                 # MODIFIED — Add shell-related types
└── tests/
    ├── unit/
    │   └── shell-spawner.test.ts    # NEW — Shell spawner unit tests
    └── system/
        └── shell-terminal.test.ts   # NEW — End-to-end shell terminal tests

frontend/
├── src/
│   ├── components/
│   │   └── ShellTerminal.tsx        # NEW — Shell terminal panel component
│   ├── hooks/
│   │   ├── usePanel.ts              # MODIFIED — Add 'shell' panel type
│   │   └── useShellTerminal.ts      # NEW — Shell WebSocket + xterm.js hook
│   └── services/
│       ├── api.ts                   # MODIFIED — Add shell API calls
│       └── ws.ts                    # MODIFIED — Add shell WS message types
└── tests/
    └── components/
        └── ShellTerminal.test.tsx   # NEW — Shell panel component tests
```

**Structure Decision**: Web application (existing backend + frontend). All new code follows established patterns. One new backend module (`shell-spawner.ts`), one new frontend component (`ShellTerminal.tsx`), and targeted modifications to existing modules.

## Complexity Tracking

No violations to justify. All design choices follow existing patterns.
