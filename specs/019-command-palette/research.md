# Research: Command Palette

**Feature**: 019-command-palette
**Date**: 2026-02-23

## Research Tasks

### RT-001: Verify `H` key is available in chord map

**Decision**: `H` is available — not bound to any existing action.

**Findings**: The existing DEFAULT_SHORTCUTS map in `useKeyboardShortcuts.ts` uses these keys: `e`, `g`, `v`, `\`, `i`, `s`, `ArrowRight`, `ArrowDown`, `ArrowLeft`, `ArrowUp`, `Tab`, `Enter`, `?`, `f`, `z`, `k`. The key `h` is unoccupied.

**Rationale**: `H` is a natural mnemonic for "Help" / command palette, easy to reach, and doesn't conflict with any existing binding.

### RT-002: Existing overlay patterns to follow

**Decision**: Follow the `ShortcutsHelp` component pattern for the palette overlay.

**Findings**: Two existing overlay components serve as reference:
1. `ShortcutsHelp.tsx` — Modal with backdrop, Escape to close, click-outside to close, content rendered in a centered card. Uses `fixed inset-0 z-50` positioning.
2. `SessionSwitcher.tsx` — Overlay with keyboard navigation (Tab/Shift+Tab cycle through items, Enter to confirm). Uses `useState` for selected index, arrow key handlers.

The CommandPalette combines both patterns: modal overlay from ShortcutsHelp + keyboard list navigation from SessionSwitcher.

**Rationale**: Reusing existing visual and interaction patterns ensures UI consistency (Constitution III) and simplicity (Constitution IV).

### RT-003: How action dispatch works

**Decision**: Reuse the existing `onAction` callback mechanism in Dashboard.tsx.

**Findings**: The `useKeyboardShortcuts` hook accepts an `onAction: (action: string) => void` callback. Dashboard.tsx implements this callback (lines 383-499) with a switch/case that handles each action. The CommandPalette can call this same function to execute commands.

The callback also dispatches `c3:shortcut` custom events for session-specific panel toggles (line 495), which SessionCard components listen to.

**Rationale**: Using the existing dispatch mechanism means every command works identically whether triggered by chord, palette, or button. Zero duplication of action logic.

### RT-004: How to derive command labels from the shortcut map

**Decision**: Add `label` field to the DEFAULT_SHORTCUTS map entries.

**Findings**: The current shortcut map entries have `{ action, category }` but no human-readable label. The ShortcutsHelp component derives display names by formatting the action string (e.g., `'toggle_files'` → `'Toggle Files'`). For the command palette, we need clean display names.

Two approaches:
- **A**: Derive labels at runtime from action strings (replace underscores, title case)
- **B**: Add explicit `label` field to each shortcut entry

**Rationale**: Option B chosen. Explicit labels are more reliable, avoid edge cases in string formatting, and allow for better descriptions (e.g., `'Search in Files'` vs auto-generated `'Search Files'`). The cost is ~17 extra string fields in the map — negligible.

**Alternatives considered**: Runtime derivation (Option A) was rejected because some action names don't produce clean labels (e.g., `'toggle_claude'` → `'Toggle Claude'` is fine, but `'focus_next'` → `'Focus Next'` is ambiguous without context like "Focus Next Session").

## Summary

No NEEDS CLARIFICATION items remain. All design decisions are resolved:
- `H` key is available and appropriate
- Follow ShortcutsHelp + SessionSwitcher patterns for the overlay
- Reuse existing `onAction` dispatch — no new action infrastructure
- Add explicit `label` fields to shortcut map entries for clean display
