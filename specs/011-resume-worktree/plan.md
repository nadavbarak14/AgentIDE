# Implementation Plan: Session Resume & Worktree Isolation

**Branch**: `011-resume-worktree` | **Date**: 2026-02-20 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-resume-worktree/spec.md`

## Summary

Two changes to session management: (1) Use `claude --resume <claudeSessionId>` for targeted conversation resume instead of `claude -c`, with fallback to `-c` when no ID is stored. (2) Add a `worktree` toggle to the session creation UI that passes `--worktree` to Claude Code for git worktree isolation.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, React 18, better-sqlite3, node-pty, ws 8, Tailwind CSS 3, Vite 6
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, one migration (add `worktree` column)
**Testing**: Vitest 2.1
**Target Platform**: Linux server (VPS)
**Project Type**: Web application (backend + frontend)
**Performance Goals**: N/A — small schema change, no performance-sensitive paths
**Constraints**: Backward compatible — existing sessions MUST continue to work unchanged
**Scale/Scope**: 8 files modified across backend and frontend

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Changes are testable; unit tests for spawn logic, integration test for API |
| II. UX-First Design | PASS | Worktree toggle follows existing checkbox pattern (startFresh) |
| III. UI Quality & Consistency | PASS | Matches existing form styling |
| IV. Simplicity | PASS | Minimal changes: 1 DB column, 1 checkbox, swap CLI arg |
| V. CI/CD Pipeline | PASS | Will merge via PR after CI passes |
| VI. Frontend Plugin Quality | PASS | No new dependencies |
| VII. Backend Security | PASS | Boolean field, no injection risk |
| VIII. Observability | PASS | Existing structured logging covers spawn args |

## Project Structure

### Documentation (this feature)

```text
specs/011-resume-worktree/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: entity changes
├── quickstart.md        # Phase 1: integration scenarios
├── contracts/           # Phase 1: API contract changes
│   └── api-changes.md
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── types.ts          # Add worktree to Session + CreateSessionInput
│   │   ├── db.ts             # Migration: add worktree column
│   │   └── repository.ts     # Read/write worktree field
│   ├── services/
│   │   └── session-manager.ts # --resume <id> logic, --worktree flag
│   ├── worker/
│   │   └── pty-spawner.ts    # spawnResume() method
│   └── api/
│       └── routes/sessions.ts # Accept worktree in POST body

frontend/
├── src/
│   ├── components/
│   │   └── SessionQueue.tsx  # Worktree checkbox in creation form
│   └── services/
│       └── api.ts            # Add worktree to Session type + create params
```

**Structure Decision**: Existing web application structure (backend/ + frontend/). No new directories needed.

## Complexity Tracking

No constitution violations. All changes are minimal and follow existing patterns.
