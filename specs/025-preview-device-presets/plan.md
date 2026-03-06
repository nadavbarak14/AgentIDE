# Implementation Plan: Preview Device Presets & Layout Persistence

**Branch**: `025-preview-device-presets` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/025-preview-device-presets/spec.md`

## Summary

Replace the cluttered View/Full toggle buttons in the preview overlay with dropdown menus on the screenshot/record action buttons. Replace the single fixed-size mobile viewport with a device preset picker offering 11 popular devices (6 phones, 5 tablets). Persist the selected device preset per session. Ensure terminal position and height are reliably restored without auto-switching overriding user's explicit choice.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Express 4, better-sqlite3, Tailwind CSS 3, Vite 6, xterm.js 5
**Storage**: SQLite (better-sqlite3) with WAL mode - existing `panel_states` table, one new column (`mobile_device_id`)
**Testing**: Vitest 2.1.0, @testing-library/react, supertest
**Target Platform**: Web (Linux server hosting, browser client)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Dropdowns open instantly (<16ms), state persistence within 100ms debounce
**Constraints**: No new runtime dependencies; dropdown pattern must match existing codebase conventions
**Scale/Scope**: 3 modified frontend components, 4 modified backend files, 1 new constants file, 1 DB migration

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for device presets, component tests for dropdowns, integration tests for persistence |
| II. UX-First Design | PASS | Feature reduces toolbar clutter, adds device presets, respects user layout choices |
| III. UI Quality & Consistency | PASS | Dropdowns follow existing ProjectPicker pattern, consistent Tailwind styling |
| IV. Simplicity | PASS | No new dependencies, minimal schema change (1 column), static preset data |
| V. CI/CD Pipeline | PASS | Standard feature branch workflow |
| VI. Frontend Plugin Quality | PASS | No new frontend dependencies |
| VII. Backend Security | PASS | New field validated in PUT handler, no auth changes |
| VIII. Observability | PASS | Existing panel state logging covers new field |

**Post-Phase 1 Re-check**: All gates still pass. Design adds one DB column, one constants file, and modifies existing components using established patterns.

## Project Structure

### Documentation (this feature)

```text
specs/025-preview-device-presets/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions and state transitions
├── quickstart.md        # Development guide
├── contracts/           # API contract changes
│   └── panel-state-api.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   ├── db.ts              # Migration: add mobile_device_id column
│   │   ├── types.ts           # Add mobileDeviceId to PanelState interface
│   │   └── repository.ts      # Add mobile_device_id to save/load/mapping
│   └── api/
│       └── routes/
│           └── sessions.ts    # Add mobileDeviceId to PUT validation & GET defaults
└── tests/

frontend/
├── src/
│   ├── constants/
│   │   └── devicePresets.ts   # NEW: Static device preset definitions
│   ├── components/
│   │   ├── PreviewOverlay.tsx  # Replace View/Full toggles with dropdown menus
│   │   └── LivePreview.tsx     # Replace mobile button with device preset dropdown
│   ├── hooks/
│   │   └── usePanel.ts        # Add mobileDeviceId state; fix terminal auto-switch
│   └── services/
│       └── api.ts             # Add mobileDeviceId to PanelStateData
└── tests/
```

**Structure Decision**: Existing web application structure (frontend/ + backend/). One new file (`frontend/src/constants/devicePresets.ts`); all other changes are modifications to existing files.
