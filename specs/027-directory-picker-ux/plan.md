# Implementation Plan: Directory Picker UX Improvements

**Branch**: `027-directory-picker-ux` | **Date**: 2026-03-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/027-directory-picker-ux/spec.md`

## Summary

Replace the text-input-only DirectoryPicker with a visual folder browser featuring clickable folder navigation, breadcrumb trail, back button, and a synced path bar. Improve path display in ProjectPicker rows, make the browse button more prominent, and increase the project list height.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS + React 18
**Primary Dependencies**: React 18, Tailwind CSS 3, Vite 6
**Storage**: N/A — no database changes
**Testing**: Vitest 2.1.0, @testing-library/react, @testing-library/jest-dom
**Target Platform**: Web browser (desktop)
**Project Type**: Web application (frontend-only changes)
**Performance Goals**: Directory listing renders within 200ms; folder navigation feels instant
**Constraints**: All UI fits within 320px sidebar width (w-80); no new npm dependencies
**Scale/Scope**: Frontend-only — modifies 2 existing components (DirectoryPicker, ProjectPicker)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for new browser interactions; component tests with @testing-library/react |
| II. UX-First Design | PASS | Core motivation of this feature — visual browsing replaces text-only input |
| III. UI Quality & Consistency | PASS | Follows existing Tailwind design language; hover/active/disabled states required |
| IV. Simplicity | PASS | No new dependencies; modifications to existing components; no new abstractions |
| V. CI/CD Pipeline | PASS | Standard branch → PR → CI → rebase-merge workflow |
| VI. Frontend Plugin Quality | PASS | No new plugins — pure React + Tailwind implementation |
| VII. Backend Security | PASS | No backend changes; existing directory listing API with path traversal protection reused |
| VIII. Observability | N/A | Frontend-only UI changes; no new logging needed |

## Project Structure

### Documentation (this feature)

```text
specs/027-directory-picker-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── directory-browser-api.md
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── DirectoryPicker.tsx    # Major rewrite — add visual folder browser
│   │   └── ProjectPicker.tsx      # Modify — path display, browse button, list height
│   └── services/
│       └── api.ts                 # No changes needed — existing API sufficient
└── tests/
    └── components/
        └── DirectoryPicker.test.tsx  # New — tests for browser navigation
        └── ProjectPicker.test.tsx    # New — tests for path display, browse button
```

**Structure Decision**: Frontend-only changes. Two existing components modified, two new test files created. No backend changes.

## Complexity Tracking

No violations — all changes use existing patterns and dependencies.
