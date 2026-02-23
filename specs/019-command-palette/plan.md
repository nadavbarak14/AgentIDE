# Implementation Plan: Command Palette

**Branch**: `019-command-palette` | **Date**: 2026-02-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-command-palette/spec.md`

## Summary

Add a searchable command palette overlay to the IDE, triggered by `Ctrl+. H` or a visible top-bar button. The palette lists all existing shortcut actions with keyboard navigation (arrow keys, Enter, Escape), real-time substring filtering, and shortcut key badges. Integrates with the existing chord system and respects custom keybindings.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, Vite 6
**Storage**: N/A — no persistence needed (palette is stateless)
**Testing**: Vitest 2.1.0, @testing-library/react
**Target Platform**: Web application (browser)
**Project Type**: Web (frontend only — no backend changes)
**Performance Goals**: Palette render < 200ms, filter response < 50ms
**Constraints**: Zero regressions to existing chord shortcuts
**Scale/Scope**: ~26 commands initially (17 shortcut-bound + 9 button-only), 2 new files, 2 modified files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for CommandPalette component + integration with chord system |
| II. UX-First Design | PASS | Keyboard-first with mouse fallback; visible button for discoverability |
| III. UI Quality & Consistency | PASS | Follows existing overlay patterns (SessionSwitcher, ShortcutsHelp) |
| IV. Simplicity | PASS | Single component + one hook modification; no new abstractions |
| V. CI/CD Pipeline | PASS | Standard PR + CI flow |
| VI. Frontend Plugin Quality | PASS | No new dependencies — pure React + Tailwind |
| VII. Backend Security | N/A | Frontend-only feature |
| VIII. Observability & Logging | N/A | No backend changes |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/019-command-palette/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A (no data model)
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A (no API changes)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   └── CommandPalette.tsx          # NEW — command palette overlay component
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts     # MODIFY — add 'h' → 'command_palette' action
│   └── pages/
│       └── Dashboard.tsx               # MODIFY — add button in top bar, render CommandPalette, handle action
└── tests/
    └── unit/
        └── command-palette.test.tsx     # NEW — unit tests for CommandPalette
```

**Structure Decision**: Frontend-only changes within the existing web application structure. One new component, one new test file, two modified files. No backend changes.

## Design Details

### Integration with Existing Chord System

The existing `useKeyboardShortcuts` hook in `frontend/src/hooks/useKeyboardShortcuts.ts` maintains a `DEFAULT_SHORTCUTS` map (lines 29-47). Each entry maps a key to an action name and category.

**Change**: Add one entry to the map:
```
'h': { action: 'command_palette', category: 'navigation', label: 'Command Palette' }
```

The hook's `onAction` callback in Dashboard.tsx (lines 383-499) already handles action dispatch. Add a case for `'command_palette'` that toggles the palette open/closed state.

### Command Registry

The palette needs a centralized flat list of ALL executable actions — both shortcut-bound and button-only. Each command entry needs:
- `action`: string (the action identifier, e.g., `'toggle_files'`, `'open_settings'`)
- `label`: string (human-readable name, e.g., `'Toggle Files'`, `'Open Settings'`)
- `category`: string (group name, e.g., `'Panels'`, `'View'`, `'Settings'`)
- `shortcutKey`: string | null (the chord key if any, e.g., `'E'` or `null`)
- `execute`: function (calls the same `onAction` callback)

**Shortcut-bound commands** (~17): Derived from the existing `DEFAULT_SHORTCUTS` map + user overrides from `getEffectiveShortcuts()`.

**Button-only commands** (~9): Registered separately in the command registry. These are actions that exist as UI buttons but have no chord shortcut:
- `toggle_sidebar` — Toggle sidebar visibility (category: View)
- `open_settings` — Open settings panel (category: Settings)
- `toggle_terminal_position` — Toggle terminal center/bottom (category: View)
- `font_size_decrease` — Decrease terminal font size (category: View)
- `font_size_increase` — Increase terminal font size (category: View)
- `pin_session` — Pin/unpin current session (category: Session Actions)
- `continue_session` — Continue completed session (category: Session Actions)
- `new_session` — Create new session (category: Session Actions)
- `toggle_file_search` — Toggle Explorer/Search in file panel (category: Panels)

The registry is a single array defined in a new module or directly in CommandPalette. Any future button/action added to the IDE MUST also be registered here.

### CommandPalette Component

A modal overlay component following the same pattern as the existing `ShortcutsHelp` and `SessionSwitcher` components:
- Fixed position overlay with backdrop
- Search input auto-focused on mount
- Filtered command list with keyboard navigation
- Selected item highlighted with distinct background
- Shortcut badge right-aligned per row
- Click outside or Escape to dismiss

### Top Bar Button

Add a button in Dashboard.tsx's top bar (near the existing controls, line ~535-560) with:
- A command/terminal icon (using inline SVG, consistent with existing button icons)
- `Ctrl+. H` displayed as a small keyboard badge
- `onClick` → toggle palette
- `title` → "Command Palette (Ctrl+. H)"

## Complexity Tracking

No violations to justify. This is a straightforward component addition following existing patterns in the codebase.
