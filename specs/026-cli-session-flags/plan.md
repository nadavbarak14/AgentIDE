# Implementation Plan: CLI Session Flags Redesign

**Branch**: `026-cli-session-flags` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-cli-session-flags/spec.md`

## Summary

Invert the default session creation behavior: new sessions start fresh (no `--continue`) by default. Replace "Clean Start" toggle with "Continue Latest" (`--continue`). Add a "Resume" toggle that spawns Claude with `--resume` (no args) to open Claude's built-in interactive session picker in the terminal.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, Tailwind CSS 3, Vite 6, better-sqlite3, ws 8
**Storage**: SQLite (better-sqlite3) with WAL mode — no schema changes needed
**Testing**: Vitest 2.1.0, supertest 7, @testing-library/react 16, jsdom 25
**Target Platform**: Linux (Ubuntu/Debian, RHEL/CentOS), macOS, WSL
**Project Type**: Web application (backend + frontend)
**Performance Goals**: N/A — no new endpoints or data loading
**Constraints**: No new npm dependencies. Zero new backend services or API endpoints.
**Scale/Scope**: ~4 files modified (backend session-manager + types, frontend SessionQueue + hook/api), tests updated

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Update existing session-flags integration tests, SessionQueue component tests |
| II. UX-First Design | PASS | Simplifies default (fresh = no flags), adds Resume toggle for power users |
| III. UI Quality & Consistency | PASS | Reuses existing toggle pattern from PREDEFINED_FLAGS |
| IV. Simplicity | PASS | No new services, no new endpoints, no new components — just flag logic changes |
| V. CI/CD Pipeline | PASS | Standard feature branch workflow |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies |
| VII. Backend Security | PASS | No new endpoints; existing input validation unchanged |
| VIII. Observability & Logging | PASS | Existing spawn logging covers new flag combinations |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/026-cli-session-flags/
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
│   ├── services/
│   │   └── session-manager.ts          # MODIFY: invert default spawn logic, add --resume support
│   ├── api/
│   │   └── routes/
│   │       └── sessions.ts             # MODIFY: accept continueLatest + resume fields in POST body
│   └── models/
│       └── types.ts                    # MODIFY: add continueLatest, resume to CreateSessionInput
└── tests/
    ├── unit/
    │   └── session-manager.test.ts     # MODIFY: update for inverted default + resume flag
    └── integration/
        └── session-flags.test.ts       # MODIFY: update for inverted default + resume flag

frontend/
├── src/
│   ├── components/
│   │   └── SessionQueue.tsx            # MODIFY: replace Clean Start with Continue Latest + Resume toggles
│   ├── hooks/
│   │   └── useSessionQueue.ts          # MODIFY: replace startFresh with continueLatest + resume params
│   └── services/
│       └── api.ts                      # MODIFY: update create() payload type
└── tests/
    └── components/
        └── SessionQueue.test.tsx       # MODIFY: update for new toggle behavior
```

**Structure Decision**: Web application structure (existing). All changes are modifications to existing files — no new files, services, or endpoints needed. This is a flag logic inversion + two new toggles.
