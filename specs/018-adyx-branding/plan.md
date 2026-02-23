# Implementation Plan: Adyx Frontend Branding

**Branch**: `018-adyx-branding` | **Date**: 2026-02-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/018-adyx-branding/spec.md`

## Summary

Replace all user-visible instances of "Multy" with "Adyx" across the frontend (HTML title, dashboard header) and backend (worker log message). Update existing branding tests to validate the new name. Internal `c3-` prefixed identifiers and "Claude" references remain unchanged.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, Vite 6, Tailwind CSS 3
**Storage**: N/A — no schema changes
**Testing**: Vitest 2.1.0 (existing test suite)
**Target Platform**: Web application (browser)
**Project Type**: Web (frontend + backend)
**Performance Goals**: N/A — text-only change, no performance impact
**Constraints**: Zero regressions to existing functionality
**Scale/Scope**: 4 files, ~10 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Existing branding tests will be updated to validate "Adyx" |
| II. UX-First Design | PASS | Consistent branding improves product identity |
| III. UI Quality & Consistency | PASS | Eliminates mixed branding, ensures consistency |
| IV. Simplicity | PASS | Minimal change — direct string replacements only |
| V. CI/CD Pipeline | PASS | Changes go through PR + CI as usual |
| VI. Frontend Plugin Quality | N/A | No new dependencies |
| VII. Backend Security | N/A | No security-relevant changes |
| VIII. Observability & Logging | PASS | Backend log message updated to reflect new name |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/018-adyx-branding/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A (no data model changes)
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A (no API changes)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── index.html                          # <title> tag change
├── src/
│   └── pages/
│       └── Dashboard.tsx               # Header <h1> change
└── tests/
    └── unit/
        └── session-grid.test.ts        # Branding test updates

backend/
└── src/
    └── worker-entry.ts                 # Log message change
```

**Structure Decision**: Existing web application structure. No new files or directories needed — all changes are in-place string replacements in existing files.

## Change Inventory

| # | File | Line | Current | New | Type |
|---|------|------|---------|-----|------|
| 1 | `frontend/index.html` | 6 | `<title>Multy</title>` | `<title>Adyx</title>` | User-visible |
| 2 | `frontend/src/pages/Dashboard.tsx` | 530 | `Multy` (in `<h1>`) | `Adyx` | User-visible |
| 3 | `backend/src/worker-entry.ts` | 15 | `'Multy Worker started...'` | `'Adyx Worker started...'` | Log message |
| 4 | `frontend/tests/unit/session-grid.test.ts` | 365-385 | All `Multy` refs | All `Adyx` refs | Tests |

## Complexity Tracking

No violations to justify. This is the simplest possible implementation: direct string replacements with no new abstractions, dependencies, or architectural changes.
