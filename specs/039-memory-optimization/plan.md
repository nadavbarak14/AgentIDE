# Implementation Plan: Memory Optimization

**Branch**: `039-memory-optimization` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/039-memory-optimization/spec.md`

## Summary

Fix unbounded memory growth in the hub, preview proxy, and remote agent by closing cleanup gaps in session lifecycle handlers. Research shows most cleanup code already exists — the fix requires adding a few missing cleanup calls and extending the database cascade. This is a **minimal, surgical fix** per user request.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, better-sqlite3, ws 8, node-pty, ssh2, http-proxy-3
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `c3.db` database
**Testing**: Vitest 2.1.0, supertest, @testing-library/react
**Target Platform**: Linux/macOS/Windows server (Node.js)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Hub memory within 20% of baseline after all sessions complete
**Constraints**: Minimal code changes; no new dependencies; no architectural changes
**Scale/Scope**: ~5 files modified, ~50 lines of production code, ~150 lines of tests

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for each cleanup addition; integration test for full session lifecycle |
| II. UX-First Design | PASS | No user-facing changes; operator benefits from stable memory |
| III. UI Quality & Consistency | N/A | No UI changes |
| IV. Simplicity | PASS | Minimal changes — adding missing cleanup calls, no new abstractions |
| V. CI/CD Pipeline | PASS | Standard branch → PR → CI → merge workflow |
| VI. Frontend Plugin Quality | N/A | No frontend changes |
| VII. Backend Security & Correctness | PASS | No new endpoints; cleanup improves correctness |
| VIII. Observability & Logging | PASS | Add debug logging for resource counts on cleanup |

**Post-Phase 1 re-check**: PASS — no new violations introduced. Design adds no abstractions, no new dependencies, no new patterns.

## Project Structure

### Documentation (this feature)

```text
specs/039-memory-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal — no new entities)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (one new debug endpoint)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── hub-entry.ts              # Add widgetStore + cookieJar cleanup on session end
│   ├── api/
│   │   └── preview-proxy.ts      # Export cookieJar for hub cleanup (already has clear method)
│   ├── models/
│   │   └── repository.ts         # Extend deleteSession() to cascade-delete related tables
│   ├── worker/
│   │   ├── pty-spawner.ts        # Add scrollbackWriters/scrollbackPending to cleanup()
│   │   └── remote-pty-bridge.ts  # Add scrollbackWriters/scrollbackPending to cleanup()
│   └── api/routes/
│       └── debug.ts              # New: minimal debug endpoint for resource counts
└── tests/
    ├── unit/
    │   ├── session-cleanup.test.ts      # Unit tests for cleanup additions
    │   └── repository-cascade.test.ts   # Unit tests for cascade delete
    └── integration/
        └── memory-cleanup.test.ts       # Integration test: full session lifecycle cleanup
```

**Structure Decision**: Web application structure (existing). Changes are surgical additions to 5 existing files plus 1 new debug route and 3 test files.

## Complexity Tracking

No violations to justify. All changes are minimal additions to existing patterns.
