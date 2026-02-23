# Tasks: Command Palette

**Input**: Design documents from `/specs/019-command-palette/`
**Prerequisites**: plan.md (required), spec.md (required), research.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests are MANDATORY. Tests for the CommandPalette component cover rendering, filtering, keyboard navigation, command execution, toggle behavior, and empty state.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (Blocking Prerequisites)

**Purpose**: Add label fields and the `command_palette` action to the existing shortcut system so user stories can build on top.

- [X] T001 Add `label` field to every entry in the `DEFAULT_SHORTCUTS` map in `frontend/src/hooks/useKeyboardShortcuts.ts`. Each existing entry (toggle_files, toggle_git, toggle_preview, toggle_claude, toggle_issues, toggle_shell, focus_next, focus_prev, switch_next, switch_prev, confirm_session, show_help, search_files, zoom_session, kill_session) gets a human-readable label string (e.g., `'Toggle Files'`, `'Focus Next Session'`, `'Zoom Session'`). Also add the new entry: `'h': { action: 'command_palette', category: 'navigation', label: 'Command Palette' }`
- [X] T002 Export the `DEFAULT_SHORTCUTS` map type and `getEffectiveShortcuts()` function from `frontend/src/hooks/useKeyboardShortcuts.ts` so they can be imported by the CommandPalette component. Ensure the label field is included in the exported type.

**Checkpoint**: The shortcut hook has labels on all entries and exports its data for consumption by the palette.

---

## Phase 2: User Story 1 - Open and Execute Commands via Keyboard (Priority: P1) 🎯 MVP

**Goal**: Create the CommandPalette component with search, keyboard navigation, and command execution triggered by `Ctrl+. H`.

**Independent Test**: Press `Ctrl+. H` → palette opens → type "files" → arrow down → Enter → files panel toggles → palette closes.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [X] T003 [P] [US1] Create unit test file `frontend/tests/unit/command-palette.test.tsx` with tests covering: palette renders when open prop is true, palette does not render when open is false, search input is auto-focused on mount, typing in search filters the command list (case-insensitive substring match on name and category), Up/Down arrow keys move selected index, Enter executes the selected command and calls onClose, Escape calls onClose without executing, empty filter shows all commands, no-match filter shows "No matching commands" message

### Implementation for User Story 1

- [X] T004 [US1] Create `frontend/src/components/CommandPalette.tsx` — a React component that accepts props: `open: boolean`, `onClose: () => void`, `onAction: (action: string) => void`. Implement: fixed-position overlay with semi-transparent backdrop (same z-index pattern as ShortcutsHelp), centered card with max-width ~480px, search input auto-focused on mount, filtered command list derived from `getEffectiveShortcuts()` labels, keyboard handler for Up/Down/Enter/Escape, selected item highlighted with distinct background, shortcut key badge right-aligned per row, click-outside-to-close via backdrop click, "No matching commands" empty state
- [X] T005 [US1] Add `command_palette` action handling in `frontend/src/pages/Dashboard.tsx`: add `const [paletteOpen, setPaletteOpen] = useState(false)` state, add `'command_palette'` case to the action handler that toggles `paletteOpen`, render `<CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onAction={handleAction} />` in the JSX. The `onAction` callback should close the palette then dispatch the action through the existing handler.

**Checkpoint**: Ctrl+. H opens the palette, user can search/filter, navigate with arrows, execute with Enter, dismiss with Escape. All US1 tests pass.

---

## Phase 3: User Story 2 - Visible Button That Teaches the Shortcut (Priority: P2)

**Goal**: Add a visible button in the dashboard top bar that opens the palette and displays the `Ctrl+. H` shortcut hint.

**Independent Test**: Visually confirm the button is in the top bar with the shortcut badge, click it to open the palette, hover for tooltip.

### Implementation for User Story 2

- [X] T006 [US2] Add a command palette button in the top bar section of `frontend/src/pages/Dashboard.tsx` (near the existing controls around line ~535-560). The button should have: an inline SVG icon (command/terminal icon consistent with existing button styling), a small `Ctrl+. H` keyboard badge rendered as a `<kbd>` or styled span, `onClick={() => setPaletteOpen(prev => !prev)}`, `title="Command Palette (Ctrl+. H)"`, Tailwind styling consistent with existing top bar buttons (text-gray-400 hover:text-white, etc.)

**Checkpoint**: Button visible in top bar with shortcut hint. Clicking opens the palette. Tooltip shows on hover.

---

## Phase 4: User Story 3 - Complete Command Registry (Priority: P3)

**Goal**: Ensure the palette lists ALL IDE actions — both shortcut-bound and button-only — with ~26 total commands.

**Independent Test**: Open palette with empty filter, count all commands. Verify all 17 shortcut actions + 9 button-only actions are present. Execute a button-only command (e.g., "Open Settings") and confirm it works.

### Implementation for User Story 3

- [X] T007 [US3] Add button-only commands to the CommandPalette component in `frontend/src/components/CommandPalette.tsx`. Define a `BUTTON_ONLY_COMMANDS` array with entries for: `toggle_sidebar` (Toggle Sidebar, category: View), `open_settings` (Open Settings, category: Settings), `toggle_terminal_position` (Toggle Terminal Position, category: View), `font_size_decrease` (Decrease Font Size, category: View), `font_size_increase` (Increase Font Size, category: View), `pin_session` (Pin/Unpin Session, category: Session Actions), `continue_session` (Continue Session, category: Session Actions), `new_session` (New Session, category: Session Actions), `toggle_file_search` (Toggle Explorer/Search, category: Panels). Merge these with the shortcut-bound commands into a single list for display.
- [X] T008 [US3] Add handling for the 9 new button-only actions in the action handler in `frontend/src/pages/Dashboard.tsx`. Each action should trigger the same behavior as clicking the corresponding button: `toggle_sidebar` toggles sidebar state, `open_settings` opens settings panel, `toggle_terminal_position`/`font_size_decrease`/`font_size_increase` dispatch as `c3:shortcut` events to the focused SessionCard, `pin_session`/`continue_session` dispatch to focused SessionCard, `new_session` focuses the session creation input, `toggle_file_search` dispatches to focused SessionCard.
- [X] T009 [US3] Add unit tests to `frontend/tests/unit/command-palette.test.tsx` verifying: all 26 commands appear when filter is empty, button-only commands show no shortcut badge, executing a button-only command calls onAction with the correct action string, shortcut-bound commands show their key badge

**Checkpoint**: All ~26 commands visible in palette. Button-only commands execute correctly. All tests pass.

---

## Phase 5: Polish & Verification

**Purpose**: Final verification, full test suite, CI.

- [X] T010 Run full test suite with `npm test` to verify zero regressions across all 18+ existing test files
- [X] T011 Verify all existing chord shortcuts still work: test each of E, G, V, \, I, S, arrows, Tab, Z, K, F, ? to confirm no regressions
- [X] T012 Verify the palette reflects custom keybindings by setting a custom key in `localStorage` under `c3-keybindings` and confirming the palette shows the custom key instead of the default
- [X] T013 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Foundational)**: No dependencies — can start immediately
- **Phase 2 (US1)**: Depends on Phase 1 (needs labels and export from hook)
- **Phase 3 (US2)**: Depends on Phase 2 (needs the palette component to exist)
- **Phase 4 (US3)**: Depends on Phase 2 (extends the palette with more commands)
- **Phase 5 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational phase. Core palette — must complete first.
- **US2 (P2)**: Depends on US1. Adds the button that opens the palette.
- **US3 (P3)**: Depends on US1. Extends the command list. Can run in parallel with US2.

### Parallel Opportunities

- T003 (tests) can run in parallel with T004/T005 if not doing strict TDD
- T006 (US2) and T007/T008 (US3) can run in parallel after US1 is complete — they modify different aspects
- T010, T011, T012 (Polish) can all run in parallel

---

## Parallel Example: User Story 3

```bash
# After US1 is complete, US2 and US3 can proceed in parallel:
# Agent A: T006 (top bar button in Dashboard.tsx)
# Agent B: T007 + T008 (button-only commands in CommandPalette.tsx + Dashboard.tsx)
# Note: T006 and T008 both modify Dashboard.tsx — if parallel, coordinate to avoid conflicts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Add labels + export from hook (T001-T002)
2. Complete Phase 2: Build CommandPalette + wire up Ctrl+. H (T003-T005)
3. **STOP and VALIDATE**: Test palette opens, filters, executes, closes
4. Proceed to US2 (button) and US3 (full registry)

### Incremental Delivery

1. Phase 1 → Foundational hook changes
2. Phase 2 → MVP palette with ~17 shortcut commands (fully usable!)
3. Phase 3 → Visible button for discoverability
4. Phase 4 → Full registry with ~26 commands
5. Phase 5 → Verification and merge

### Summary

| Metric | Value |
|--------|-------|
| Total tasks | 13 |
| US1 tasks | 3 (test + component + wiring) |
| US2 tasks | 1 (button) |
| US3 tasks | 3 (commands + handlers + tests) |
| Foundational tasks | 2 |
| Polish tasks | 4 |
| Files created | 2 (CommandPalette.tsx, command-palette.test.tsx) |
| Files modified | 2 (useKeyboardShortcuts.ts, Dashboard.tsx) |
| Total commands | ~26 (17 shortcut + 9 button-only) |

---

## Notes

- The CommandPalette component follows the ShortcutsHelp overlay pattern for visual consistency
- The `onAction` callback is shared between chord system and palette — single source of truth for action dispatch
- Button-only commands need new cases in Dashboard.tsx's action handler, dispatched as `c3:shortcut` events to SessionCard
- Custom keybindings are read from localStorage `c3-keybindings` via `getEffectiveShortcuts()` — palette automatically reflects them
- No new npm dependencies — pure React + Tailwind
