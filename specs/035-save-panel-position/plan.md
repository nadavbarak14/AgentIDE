# Implementation Plan: Save Panel Position

**Branch**: `035-save-panel-position` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/035-save-panel-position/spec.md`

## Summary

Two changes: (1) Keep the Claude Code terminal in the top zone (horizontal alongside panels) when panels open, instead of auto-moving it to the bottom zone. (2) Persist exact panel layout dimensions per panel combination so layouts are restored when toggling panels in and out. The existing left/right panel arrangement is unchanged. Adds a new `panel_layout_snapshots` table for per-combination memory.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, better-sqlite3, Tailwind CSS 3, Vite 6, xterm.js 5
**Storage**: SQLite (better-sqlite3) with WAL mode — existing `c3.db` database, one new table (`panel_layout_snapshots`)
**Testing**: Vitest 2.1.0, @testing-library/react, supertest
**Target Platform**: Web (desktop browsers; mobile layout unchanged)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Layout transitions instant (no flash); auto-save debounce ≤100ms
**Constraints**: Minimum panel widths (200px panels, 300px terminal) respected; mobile unchanged
**Scale/Scope**: Per-session state, ~10-20 panel combinations max per session

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for layout, integration tests for snapshot persistence |
| II. UX-First Design | PASS | Feature driven by user need — terminal staying up preserves context |
| III. UI Quality & Consistency | PASS | No new UI elements; existing layout behavior modified |
| IV. Simplicity | PASS | Core change is removing one auto-positioning effect + adding snapshot table |
| V. CI/CD Pipeline | PASS | Standard feature branch workflow |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies |
| VII. Backend Security | PASS | New endpoints validate input; non-sensitive data |
| VIII. Observability & Logging | PASS | Existing panel save logging covers snapshot saves |

**Post-Design Re-check**: All gates pass.

## Project Structure

### Documentation (this feature)

```text
specs/035-save-panel-position/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Research decisions
├── data-model.md        # Data model (new table)
├── quickstart.md        # Implementation guide
├── contracts/
│   └── api.md           # REST endpoint definitions
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── db.ts              # Schema: new panel_layout_snapshots table
│   │   ├── repository.ts      # New snapshot CRUD methods
│   │   └── types.ts           # New LayoutSnapshot type
│   └── api/
│       └── routes/
│           └── sessions.ts    # New snapshot endpoints
└── tests/

frontend/
├── src/
│   ├── components/
│   │   └── SessionCard.tsx    # Remove auto-positioning to bottom
│   ├── hooks/
│   │   └── usePanel.ts        # Combination key + snapshot save/restore
│   ├── utils/
│   │   └── panelLayout.ts     # No changes needed
│   └── services/
│       └── api.ts             # New layout snapshot API client
└── tests/
    └── unit/
        └── panelLayout.test.ts
```

**Structure Decision**: Existing web application structure. All changes fit within existing directories.

## Complexity Tracking

No constitution violations. Core change is straightforward:
- Remove one `useEffect` that auto-moves terminal to bottom
- Add one new DB table following existing patterns
- Add snapshot save/restore logic into existing auto-save flow
