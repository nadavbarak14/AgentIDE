# Implementation Plan: Mobile Extensions & Projects Relocation

**Branch**: `044-mobile-extensions-projects` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/044-mobile-extensions-projects/spec.md`

## Summary

Relocate the Projects entry point out of the mobile hamburger menu (which is session-scoped) into a dedicated top-bar icon for 1-tap access. Upgrade the mobile extensions panel from a simple list-then-open-one model to a tabbed overlay that supports quick-switching between enabled extensions. No new dependencies, no schema changes, no backend modifications — all changes are frontend-only within existing components.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS + React 18
**Primary Dependencies**: React 18, Tailwind CSS 3, Vite 6 (all existing)
**Storage**: N/A — no database or schema changes
**Testing**: Vitest 2.1.0, @testing-library/react, @testing-library/jest-dom (existing)
**Target Platform**: Mobile web (320px–428px viewport), responsive overlays
**Project Type**: Web application (frontend-only changes)
**Performance Goals**: Extension switch transitions < 1 second, smooth 60fps slide animations
**Constraints**: Single-panel overlay model (only one overlay visible at a time via `useMobilePanel`), touch targets >= 44px, safe area insets for notched devices
**Scale/Scope**: 3 files modified significantly (MobileTopBar, MobileHamburgerMenu, MobileLayout), 1 new component (MobileExtensionTabs), existing tests extended

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for new MobileExtensionTabs component + updated tests for MobileHamburgerMenu (projects removed) and MobileTopBar (projects icon added). System tests via existing preview-and-extensions-fixes test suite. |
| II. UX-First Design | PASS | Core motivation: projects are cross-session concept, don't belong in session hamburger. Extension quick-switch reduces navigation friction. |
| III. UI Quality & Consistency | PASS | Follows existing mobile design language: MobileSheetOverlay for panels, same icon style as hamburger items, consistent spacing/typography. |
| IV. Simplicity | PASS | No new dependencies, no backend changes, no schema changes. Reuses existing components (MobileSheetOverlay, ExtensionPanel). Tab bar is minimal (horizontal scroll of enabled extension names). |
| V. CI/CD Pipeline | PASS | All changes go through PR + CI. |
| VI. Frontend Plugin Quality | PASS | No new plugins/libraries. Uses existing React, Tailwind. |
| VII. Backend Security | N/A | No backend changes. |
| VIII. Observability | PASS | No new logging needed — existing extension load/enable logging sufficient. |

**Gate result: PASS** — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/044-mobile-extensions-projects/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A — no API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── MobileTopBar.tsx              # MODIFY: add projects icon button
│   │   ├── MobileHamburgerMenu.tsx       # MODIFY: remove Projects menu item
│   │   ├── MobileLayout.tsx              # MODIFY: update extension panel to use tabs, wire projects icon, keep preview mounted
│   │   ├── MobilePreviewSheet.tsx        # MODIFY: accept visible prop for show/hide instead of mount/unmount
│   │   └── MobileExtensionTabs.tsx       # NEW: tabbed extension quick-switch component
│   └── hooks/
│       └── useMobilePanel.ts             # NO CHANGE: existing panel types already include 'projects'
└── tests/
    └── components/
        ├── preview-and-extensions-fixes.test.tsx  # EXTEND: update mobile extension tests
        └── mobile-extensions-projects.test.tsx    # NEW: dedicated tests for this feature
```

**Structure Decision**: Web application (frontend-only). All changes are in `frontend/src/components/` with one new component and four modified components. No backend changes needed — the extension enable/disable API and project API already exist and work correctly.

## Complexity Tracking

> No violations — table intentionally empty.
