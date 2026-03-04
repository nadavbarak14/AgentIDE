# Implementation Plan: Session Permission Flags

**Branch**: `020-session-permissions` | **Date**: 2026-03-03 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/020-session-permissions/spec.md`

## Summary

Add a CLI flags input field to the session creation UI so users can pass custom flags (like `--dangerously-skip-permissions`) to the Claude process at session start. Unify the existing worktree and clean-start checkboxes into predefined flag chips alongside the new permissions flag. MVP scope: P1 (free-form flags field) + P2 (predefined quick-select chips).

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, better-sqlite3, node-pty, Tailwind CSS 3, Vite 6
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, one migration (add `flags` column)
**Testing**: Vitest 2.1.0, @testing-library/react, supertest
**Target Platform**: Linux server (local + remote SSH workers)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: Session creation under 5 seconds including flag processing
**Constraints**: No new npm dependencies. Flag parsing implemented with built-in string manipulation.
**Scale/Scope**: Single new DB column, 6 backend files modified, 3 frontend files modified

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for flag parsing/deduplication, integration tests for session creation with flags, frontend component tests for chip toggles and warning display |
| II. UX-First Design | PASS | Spec was UX-driven (clarification focused on interaction pattern). Inline flags field + chips is minimal friction |
| III. UI Quality & Consistency | PASS | Predefined chips use existing Tailwind design language. Warning uses existing color patterns |
| IV. Simplicity | PASS | No new abstractions. Extends existing args array. Static predefined flags array (no DB storage). No new npm packages |
| V. CI/CD Pipeline | PASS | Standard branch → PR → CI → merge workflow |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies |
| VII. Backend Security | PASS | Flags are pass-through to Claude process (not interpreted by backend). No injection risk — flags go to PTY spawn, not shell execution |
| VIII. Observability | PASS | Session creation already logged. Add flag values to existing log lines |

## Project Structure

### Documentation (this feature)

```text
specs/020-session-permissions/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Schema changes and entity definitions
├── quickstart.md        # Implementation quickstart guide
├── contracts/           # API contract changes
│   └── api.md           # REST endpoint changes
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── db.ts              # MODIFY: Add flags column migration
│   │   ├── types.ts           # MODIFY: Add flags to interfaces
│   │   └── repository.ts      # MODIFY: Include flags in queries
│   ├── services/
│   │   └── session-manager.ts # MODIFY: Parse flags, merge into spawn args
│   └── api/
│       └── routes/
│           └── sessions.ts    # MODIFY: Extract flags from request body
└── tests/                     # ADD: Flag parsing and session creation tests

frontend/
├── src/
│   ├── components/
│   │   └── SessionQueue.tsx   # MODIFY: Replace checkboxes with flags UI
│   ├── services/
│   │   └── api.ts             # MODIFY: Add flags to Session type and create payload
│   └── hooks/
│       └── useSessionQueue.ts # MODIFY: Pass flags through
└── tests/                     # ADD: Component tests for flag chips
```

**Structure Decision**: Existing web application structure (backend/ + frontend/) is unchanged. All changes are modifications to existing files. No new files needed except test files.

## Complexity Tracking

No violations to justify. All changes follow existing patterns:
- DB migration follows existing `ALTER TABLE` pattern in `db.ts`
- API route change follows existing parameter extraction pattern
- Frontend follows existing checkbox → form submission pattern
