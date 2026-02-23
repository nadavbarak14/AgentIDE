# Quickstart: Command Palette

**Feature**: 019-command-palette
**Date**: 2026-02-23

## What This Feature Does

Adds a searchable command palette overlay triggered by `Ctrl+. H` or a visible top-bar button. Users can type to filter, arrow-key to navigate, and Enter to execute any IDE action — all without touching the mouse.

## Files to Create

1. **`frontend/src/components/CommandPalette.tsx`** — The palette overlay component with search input, filtered command list, keyboard navigation, and shortcut badges

2. **`frontend/tests/unit/command-palette.test.tsx`** — Unit tests covering: open/close, filtering, keyboard navigation, command execution, toggle behavior, empty state

## Files to Modify

3. **`frontend/src/hooks/useKeyboardShortcuts.ts`** — Add `'h'` → `{ action: 'command_palette', category: 'navigation', label: 'Command Palette' }` to DEFAULT_SHORTCUTS map. Add `label` field to all existing entries.

4. **`frontend/src/pages/Dashboard.tsx`** — Add `command_palette` case to action handler (toggle state). Add visible button in top bar with icon + `Ctrl+. H` badge. Render `<CommandPalette>` component when open.

## What NOT to Change

- No backend files — this is entirely frontend
- No new npm dependencies — uses React, Tailwind, and existing hooks
- The existing ShortcutsHelp (`Ctrl+. ?`) remains as-is — both coexist
- No changes to localStorage keys or custom events

## Verification

```bash
# Run tests
cd frontend && npx vitest run tests/unit/command-palette.test.tsx

# Run full test suite
npm test

# Verify no regressions
# Open app → press Ctrl+. → verify all existing chords still work
# Press Ctrl+. H → verify palette opens
# Type "files" → verify filter works
# Press Enter → verify command executes
# Click top-bar button → verify palette opens via click
```
