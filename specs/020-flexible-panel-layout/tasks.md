# Tasks: Flexible Panel Layout Manager

**Input**: Design documents from `/specs/020-flexible-panel-layout/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY. Tests MUST use real dependencies — mocks are permitted ONLY when genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new libraries and create directory/file scaffolding

- [x] T001 Install frontend dependencies: `cd frontend && npm install @dnd-kit/core @dnd-kit/sortable react-resizable-panels`
- [x] T002 [P] Create `frontend/src/types/layout.ts` with empty placeholder exports (LayoutConfig, CellConfig, PanelId, LayoutPresetId, LayoutPreset types — stubs only, filled in Phase 2)
- [x] T003 [P] Create `frontend/src/constants/layoutPresets.ts` with empty LAYOUT_PRESETS export (stub only, filled in Phase 2)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, state management, backend migration, and base grid component that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Fill in `frontend/src/types/layout.ts` with complete TypeScript types: `LayoutConfig`, `CellConfig`, `PanelId` (union of all panel type strings), `LayoutPresetId` (union of 6 preset IDs), `LayoutPreset` with `PresetStructure` nested type — match data-model.md exactly
- [x] T005 [P] Fill in `frontend/src/constants/layoutPresets.ts` with all 6 `LayoutPreset` constant definitions: `equal-3col`, `2left-1right`, `1left-2right`, `2top-1bottom`, `1top-2bottom`, `focus` — each with label, description, slotCount, structure tree, and defaultSizes — match data-model.md entity table
- [x] T006 Add SQLite migration in `backend/src/models/db.ts`: run `ALTER TABLE panel_states ADD COLUMN layout_config TEXT DEFAULT NULL` at startup if the column doesn't already exist (use `PRAGMA table_info` check to guard against re-runs)
- [x] T007 Extend `backend/src/api/routes/sessions.ts` GET handler: include `layout_config` (parsed from JSON string or `null`) in the response object for `GET /api/sessions/:sessionId/panel-state`
- [x] T008 Extend `backend/src/api/routes/sessions.ts` PUT handler: accept `layoutConfig` in the request body; validate that `presetId` is one of the 6 known values, `sizes` sums to 100 ± 1.0, and `cells.length` matches the preset's `slotCount`; serialize to JSON string and store in `layout_config` column; return 400 with descriptive message on validation failure
- [x] T009 Create `frontend/src/hooks/useLayoutConfig.ts`: implement the `useLayoutConfig(sessionId)` hook with: state initialisation (load from `GET /api/sessions/:id/panel-state`, fall back to migrating legacy `leftPanel`/`rightPanel`/`bottomPanel` values to `equal-3col` LayoutConfig), auto-save on change (100ms debounce via `panelStateApi`), and all state-mutation functions: `applyPreset`, `movePanel`, `closePanel`, `openPanel`, `swapPanels`, `updateSizes` — pure state transitions matching data-model.md state transitions section
- [x] T010 Write unit tests for `useLayoutConfig` in `tests/unit/useLayoutConfig.test.ts`: test load from API, legacy migration path, `applyPreset` with panel redistribution to new slot count, `movePanel` swap logic, `closePanel` with stacked panel promotion, `openPanel` to first empty cell, `updateSizes` — use real hook with mocked `panelStateApi` (justification: external HTTP call; use `vi.mock`)
- [x] T011 [P] Write unit tests for preset constants in `tests/unit/layoutPresets.test.ts`: verify each preset's `slotCount` matches its `structure` leaf-cell count, `defaultSizes` arrays sum to 100, all 6 required IDs are present
- [x] T012 [P] Write unit tests for legacy migration in `tests/unit/layoutMigration.test.ts`: verify that a `panel_states` row with `left_panel='files'`, `right_panel='git'`, `bottom_panel='shell'` migrates to an `equal-3col` LayoutConfig with the correct cell assignments
- [x] T013 Create base `frontend/src/components/FlexiblePanelGrid.tsx`: render a `ResizablePanelGroup` tree from `layoutConfig.presetId` using `react-resizable-panels` — each leaf cell renders `props.renderPanel(cellId, activePanelId)` — include `ResizableHandle` between every adjacent cell — apply `minSize` constraints (15% horizontal, 12% vertical matching data-model.md minimums) — call `onLayoutChange` with updated sizes on `onLayout` callback from `react-resizable-panels` — no DnD yet (added in US1 phase)

**Checkpoint**: Foundation ready — all user story phases can now begin. Run `npm test` and confirm T010–T012 pass.

---

## Phase 3: User Story 1 — Drag Panel to New Position (Priority: P1) 🎯 MVP

**Goal**: Users can grab any panel's header and drag it to a different grid cell; panels swap positions; layout is persisted.

**Independent Test**: Open the IDE, drag any panel header to a different cell, confirm it lands in the new position, reload the page and confirm the new position is remembered.

### Tests for User Story 1 ✅

- [x] T014 [P] [US1] Write unit tests for drag operations in `tests/unit/useLayoutConfig.test.ts` (extend existing file): test `movePanel('files', 'cell-1')` correctly updates `cells` array (activePanelId moves, source cell becomes null or promotes stacked), test `swapPanels('files', 'git')` exchanges positions between cells, test drag to same cell is a no-op
- [ ] T015 [P] [US1] Write system test for drag-to-reorder in `tests/system/flexiblePanelLayout.test.ts`: spawn real backend + frontend (Vitest + supertest), use `@testing-library/user-event` to simulate pointer-down on panel header, pointer-move over drop zone, pointer-up; assert DOM shows panel in new cell; assert `GET /api/sessions/:id/panel-state` returns updated `layoutConfig`

### Implementation for User Story 1

- [x] T016 [US1] Create `frontend/src/components/PanelHeader.tsx`: renders panel title, a drag-handle div using `@dnd-kit/core` `useDraggable({ id: panelId })` (cursor changes to grab on hover, cursor: grabbing while dragging), and a close button (✕) that calls `props.onClose(panelId)` — apply `transform` CSS from dnd-kit's `useDraggable` transform output to animate the drag overlay
- [x] T017 [US1] Extend `frontend/src/components/FlexiblePanelGrid.tsx` with `@dnd-kit/core` `DndContext` wrapping the `ResizablePanelGroup` tree: add `useDroppable({ id: cellId })` to each cell container; highlight drop-zone cell with a blue border ring (`ring-2 ring-blue-500`) when a dragged panel hovers over it; on `DragEndEvent`, call `props.onLayoutChange` with result of `movePanel` or `swapPanels` depending on whether target cell is empty or occupied; set `pointer-events: none` on all panel content (xterm, Monaco) during drag via a CSS class toggled on `DragStartEvent` / `DragEndEvent` to prevent iframe/canvas interference
- [x] T018 [US1] Create `frontend/src/components/DragOverlay.tsx`: render a translucent panel-shaped card using dnd-kit's `DragOverlay` component showing the panel's title while dragging — ensures the drag ghost looks correct over terminal/Monaco content
- [x] T019 [US1] Update `frontend/src/components/SessionCard.tsx`: replace the existing hardcoded 3-zone flexbox layout with `<FlexiblePanelGrid layoutConfig={layoutConfig} onLayoutChange={handleLayoutChange} renderPanel={renderPanel} />` where `layoutConfig` and `handleLayoutChange` come from `useLayoutConfig(session.id)` and `renderPanel` maps `panelId` to the existing panel components (FilesPanel, GitPanel, PreviewPanel, TerminalPanel, etc.)
- [x] T020 [US1] Add structured logging in `backend/src/api/routes/sessions.ts`: log at INFO level when `layout_config` is saved (`session_id`, `preset_id`, `cell_count`); log at ERROR level when `layoutConfig` validation fails (include the validation error message) — Principle VIII

**Checkpoint**: User Story 1 fully functional. Drag any panel to a new position, verify swap, reload, verify persistence. Run T014 + T015 tests — both must pass.

---

## Phase 4: User Story 2 — Resize Panels by Dragging Dividers (Priority: P2)

**Goal**: Users hover over the divider between two panels and drag to resize both simultaneously; sizes are persisted.

**Independent Test**: Open the IDE with the default layout, hover over the divider between two panels (cursor changes to col-resize or row-resize), drag to resize, reload, confirm sizes are restored.

### Tests for User Story 2 ✅

- [x] T021 [P] [US2] Write unit tests for `updateSizes` in `tests/unit/useLayoutConfig.test.ts` (extend): test that `updateSizes('cell-group-h0', [40, 60])` correctly updates the `sizes` array in `layoutConfig`; test that sizes below minimum (15%) are clamped; test that auto-save is triggered after resize
- [ ] T022 [P] [US2] Write system test for resize persistence in `tests/system/flexiblePanelLayout.test.ts` (extend): drag a `ResizableHandle` divider 100px to the right using pointer events; assert the panel's computed width changes; assert `GET /api/sessions/:id/panel-state` returns updated `sizes` in `layoutConfig`

### Implementation for User Story 2

- [x] T023 [US2] Wire `onLayout` callback in `frontend/src/components/FlexiblePanelGrid.tsx`: each `ResizablePanelGroup` passes an `onLayout={(sizes) => props.onLayoutChange(updateSizes(groupId, sizes))}` callback — this connects `react-resizable-panels` size events to `useLayoutConfig` state
- [x] T024 [US2] Style `ResizableHandle` in `frontend/src/components/FlexiblePanelGrid.tsx`: apply Tailwind classes matching the existing divider design (`bg-gray-700 hover:bg-blue-500 transition-colors`) and correct cursor (`cursor-col-resize` for horizontal, `cursor-row-resize` for vertical); ensure handles are 4px wide/tall (matching current `h-1`/`w-1` resize handles in SessionCard.tsx)
- [x] T025 [US2] Validate minimum size enforcement in `frontend/src/components/FlexiblePanelGrid.tsx`: set `minSize={15}` on horizontal `ResizablePanel` and `minSize={12}` on vertical `ResizablePanel` props — confirm these values match the pixel minimums documented in data-model.md (200px at 1280px viewport = ~15%)

**Checkpoint**: User Story 2 fully functional. Resize any divider, verify both panels adjust, verify cursor changes, reload, verify sizes persist. Run T021 + T022 — both must pass.

---

## Phase 5: User Story 3 — Switch Grid Layout Presets (Priority: P2)

**Goal**: Users open a preset picker in the toolbar and select a layout (e.g., "2 Left + 1 Right"); all panels rearrange to the new grid instantly; no panel content is lost.

**Independent Test**: Open the IDE, click the layout picker button in the toolbar, select "2 Left + 1 Right", confirm the panel grid reshapes with two stacked cells on the left and one wide cell on the right; verify all panels remain visible and no content is reset.

### Tests for User Story 3 ✅

- [x] T026 [P] [US3] Write unit tests for `applyPreset` in `tests/unit/useLayoutConfig.test.ts` (extend): test switching from `equal-3col` (3 panels) to `2left-1right` distributes panels across new cells in order, with no panel lost; test switching to `focus` (1 slot) when 3 panels are open stacks overflow panels in `stackedPanelIds`; test that `sizes` reset to the new preset's `defaultSizes`
- [ ] T027 [P] [US3] Write system test for preset switching in `tests/system/flexiblePanelLayout.test.ts` (extend): render the IDE with 3 panels open in `equal-3col`, click the preset picker, select `1left-2right`, assert the DOM grid structure changes to match, assert all 3 panels are still rendered (no content lost), assert `layoutConfig.presetId` is `'1left-2right'` in the API response

### Implementation for User Story 3

- [x] T028 [US3] Create `frontend/src/components/LayoutPresetPicker.tsx`: renders a grid-icon button in the toolbar; on click opens a Tailwind popover (absolutely positioned `div` with `z-50 shadow-lg bg-gray-800 border border-gray-700 rounded-lg p-2`); popover contains 6 preset option buttons arranged in a 2×3 grid, each showing an SVG icon representing the layout and a label; clicking a preset calls `props.onPresetSelect(presetId)` and closes the popover; selected preset has a blue highlight (`ring-2 ring-blue-500`); use `useRef` + `useEffect` for click-outside-to-close
- [x] T029 [US3] Create SVG layout icons in `frontend/src/components/LayoutPresetPicker.tsx` (inline SVGs, no external files): each icon is a 32×24px rectangle subdivided with lines matching the preset's grid structure (e.g., for `equal-3col`: three equal vertical bands; for `2left-1right`: left half split horizontally, right half full-height) — use `currentColor` for stroke so icons respond to Tailwind text color classes
- [x] T030 [US3] Integrate `LayoutPresetPicker` into `frontend/src/components/SessionCard.tsx` toolbar: add `<LayoutPresetPicker currentPresetId={layoutConfig.presetId} onPresetSelect={(id) => handleLayoutChange(applyPreset(id))} />` next to the existing zoom controls in the session toolbar div
- [x] T031 [US3] Implement panel overflow stacking in `frontend/src/hooks/useLayoutConfig.ts` `applyPreset` function: when switching to a preset with fewer slots than open panels, collect all current panel IDs, assign one to each new cell's `activePanelId`, and push remaining panels into `stackedPanelIds` of the last cell — ensures FR-012 is satisfied

**Checkpoint**: User Story 3 fully functional. Switch between all 6 presets, confirm panel grid reshapes each time, confirm all panels survive the switch, confirm persistence. Run T026 + T027 — both must pass.

---

## Phase 6: User Story 4 — Close and Reopen Panels (Priority: P3)

**Goal**: Users click ✕ on any panel header to hide it (neighbors expand to fill); users reopen hidden panels from a visibility menu in the toolbar.

**Independent Test**: Open the IDE with 3 panels, close one by clicking ✕ on its header, confirm neighbors expand, try to close the last remaining panel and confirm the button is disabled, open the panel visibility menu and click the closed panel name to reopen it.

### Tests for User Story 4 ✅

- [x] T032 [P] [US4] Write unit tests for `closePanel` and `openPanel` in `tests/unit/useLayoutConfig.test.ts` (extend): test `closePanel('git')` removes it from its cell (promotes stacked panel if any, else sets `activePanelId` to null); test `openPanel('git')` places it in the first empty cell or stacks it in cell-0 if no empty cells; test that closing the last visible panel is blocked (function is a no-op, state unchanged)
- [ ] T033 [P] [US4] Write system test for close/reopen in `tests/system/flexiblePanelLayout.test.ts` (extend): click the ✕ button on a panel header, assert the panel component is removed from the DOM, assert adjacent panel expands (check computed width increases), open the PanelVisibilityMenu, click the closed panel name, assert the panel reappears in the DOM

### Implementation for User Story 4

- [x] T034 [US4] Activate the close button in `frontend/src/components/PanelHeader.tsx` (stub was created in T016): wire the ✕ button's `onClick` to call `props.onClose(panelId)` — disable the button with a tooltip ("Cannot close the last panel") when `props.isLastVisible === true` using the HTML `disabled` attribute and a Tailwind `opacity-50 cursor-not-allowed` class
- [x] T035 [US4] Add `isLastVisible` prop computation in `frontend/src/components/FlexiblePanelGrid.tsx`: count panels with non-null `activePanelId` across all cells; if count === 1, pass `isLastVisible={true}` to that cell's `PanelHeader`; all others receive `isLastVisible={false}`
- [x] T036 [US4] Create `frontend/src/components/PanelVisibilityMenu.tsx`: renders a "Panels" button in the toolbar; on click opens a Tailwind dropdown listing all panels from `props.availablePanels` with a checkmark icon (✓) next to panels that are currently active or stacked, and a dim style for closed panels; clicking an active panel calls `props.onTogglePanel(panelId)` to close it; clicking a closed panel calls `props.onTogglePanel(panelId)` to reopen it; the active panel toggle button is disabled when it is the last visible panel (same rule as close button)
- [x] T037 [US4] Integrate `PanelVisibilityMenu` into `frontend/src/components/SessionCard.tsx` toolbar: add `<PanelVisibilityMenu layoutConfig={layoutConfig} availablePanels={allRegisteredPanels} onTogglePanel={handleTogglePanel} />` alongside `LayoutPresetPicker` in the toolbar

**Checkpoint**: User Story 4 fully functional. Close and reopen panels, verify last-panel protection, verify neighbors expand, verify persistence. Run T032 + T033 — both must pass.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Overflow stacking UI, visual regression validation, full system integration, and CI merge

- [x] T038 Implement panel tab bar in `frontend/src/components/FlexiblePanelGrid.tsx` for stacked panels: when a cell's `stackedPanelIds` is non-empty, render a tab strip below the `PanelHeader` showing tab buttons for each stacked panel; clicking a tab calls `onLayoutChange` with `swapPanels(activePanelId, stackedPanelId)` to bring that panel to the front — satisfies FR-012 overflow stacking requirement
- [ ] T039 [P] Write full integration system test in `tests/system/flexiblePanelLayout.test.ts` covering the combined workflow: (1) start with `equal-3col` + 3 panels, (2) drag panel to new position, (3) resize divider, (4) switch to `2left-1right`, (5) close a panel, (6) reopen it, (7) reload page, (8) assert full layout is restored — this validates all 4 user stories work together
- [ ] T040 [P] Visual regression check: manually verify (screenshot comparison) that the default `equal-3col` preset with files/terminal/git renders identically to the current `SessionCard.tsx` 3-zone layout before this feature — document any pixel differences and confirm they are acceptable (run `npm run dev`, screenshot, compare with baseline stored in `specs/020-flexible-panel-layout/baseline-layout.png`)
- [ ] T041 [P] Verify minimum size constraints work end-to-end: in the running IDE, drag a `ResizableHandle` to the extreme left/right/top/bottom and confirm panels stop at their minimum size and do not collapse below 200px (horizontal) or 150px (vertical) — document result in a comment in `FlexiblePanelGrid.tsx`
- [ ] T042 Run quickstart.md validation: follow every step in `specs/020-flexible-panel-layout/quickstart.md` from scratch in a clean environment; fix any step that fails or is out of date
- [x] T043 Security review: confirm `layoutConfig` JSON is validated server-side before writing to SQLite (no raw SQL injection vectors in the JSON blob storage); confirm no sensitive data is included in layout config payload; log a WARNING if an unknown `panelId` is encountered in `layoutConfig` during load
- [x] T044 [P] Verify test coverage: run `npm test -- --coverage` and confirm overall coverage does not decrease from the pre-feature baseline; all new files in `frontend/src/constants/`, `frontend/src/types/`, `frontend/src/hooks/useLayoutConfig.ts`, and `frontend/src/components/Flexible*.tsx` must have > 80% line coverage
- [ ] T045 Push branch, create PR, wait for CI green, rebase-merge to main following Principle V exactly: `git push -u origin 020-flexible-panel-layout` → `gh pr create` → `gh pr checks --watch` → `gh pr merge --rebase` only after all checks green

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — **BLOCKS all user story phases**
- **Phase 3 (US1 - Drag)**: Depends on Phase 2 completion
- **Phase 4 (US2 - Resize)**: Depends on Phase 2 completion; can run in parallel with US1 if staffed (both modify `FlexiblePanelGrid.tsx` — coordinate to avoid conflicts)
- **Phase 5 (US3 - Presets)**: Depends on Phase 2 completion; independent of US1 and US2
- **Phase 6 (US4 - Close/Reopen)**: Depends on Phase 2 completion; benefits from US1's `PanelHeader` (T016) being done first
- **Phase 7 (Polish)**: Depends on all desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 only — no dependencies on US2, US3, US4
- **US2 (P2)**: Depends on Phase 2 only — independent of US1 (different FlexiblePanelGrid concern)
- **US3 (P2)**: Depends on Phase 2 only — independent of US1, US2
- **US4 (P3)**: Depends on Phase 2, benefits from US1's PanelHeader (T016) but can use stub close button if needed

### Within Each User Story

- Tests MUST be written first and confirmed to FAIL before writing implementation
- Unit tests (hook operations) before component implementation
- Component implementation before SessionCard integration
- Story complete and validated before moving to next priority

### Critical Path

```
T001 → T004-T013 (Foundation) → T016-T020 (US1 drag) → T023-T025 (US2 resize)
                              → T028-T031 (US3 presets)
                              → T034-T037 (US4 close/reopen)
                              → T038-T045 (Polish)
```

---

## Parallel Opportunities

### Phase 1
```
T002, T003 can run in parallel (different files)
```

### Phase 2 (Foundation)
```
T005, T011, T012 can run in parallel with T004 (constants/tests, independent of type stubs)
T006, T007, T008 can run in parallel (backend files only)
T010 can start after T009 (hook tests need hook implementation)
T013 can start after T004 + T005 (grid needs types + presets)
```

### Phase 3 (US1)
```
T014, T015 can run in parallel (unit test + system test scaffold)
T016, T018 can run in parallel after T014 (PanelHeader + DragOverlay, different files)
T017 follows T016 (DnD zones need PanelHeader drag handle design finalised)
T019 follows T017 (SessionCard integration needs grid + header complete)
T020 can run in parallel with T019 (logging, backend file)
```

### Phase 4 (US2)
```
T021, T022 can run in parallel (unit + system test scaffold)
T023, T024, T025 can run in parallel after T021 (all in FlexiblePanelGrid.tsx — coordinate edits)
```

### Phase 5 (US3)
```
T026, T027 can run in parallel (unit + system test scaffold)
T028, T029 can be done together (same component file)
T030 follows T028 (integration needs component)
T031 can be written alongside T028 (different file — hook logic)
```

### Phase 7 (Polish)
```
T039, T040, T041, T044 can run in parallel
```

---

## Parallel Example: Phase 2 (Foundation)

```bash
# Parallel group A — frontend types and constants:
Task: "Fill types in frontend/src/types/layout.ts"                   # T004
Task: "Fill constants in frontend/src/constants/layoutPresets.ts"    # T005

# Parallel group B — backend changes:
Task: "SQLite migration in backend/src/models/db.ts"                 # T006
Task: "Extend GET handler in backend/src/api/routes/sessions.ts"     # T007
Task: "Extend PUT handler with layoutConfig validation"               # T008

# Parallel group C — tests (can write alongside A+B):
Task: "Unit tests for preset constants"                               # T011
Task: "Unit tests for legacy migration"                               # T012
```

---

## Implementation Strategy

### MVP First (User Story 1 Only — Drag to New Position)

1. Complete Phase 1: Setup (install packages, create stubs)
2. Complete Phase 2: Foundational (types, backend, hook, base grid)
3. Complete Phase 3: US1 (PanelHeader drag, DnD drop zones, SessionCard wire-up)
4. **STOP and VALIDATE**: Can you drag any panel to a new position? Does it persist on reload?
5. Demo or ship the MVP

### Incremental Delivery

1. Setup + Foundational → Base flexible grid renders identically to current layout
2. US1 (Drag) → Panels can be dragged to new positions ← **MVP**
3. US2 (Resize) → Dividers resize panels and persist sizes
4. US3 (Presets) → Preset picker in toolbar, instant layout switching
5. US4 (Close/Reopen) → Panel visibility toggle
6. Polish → Overflow stacking, tests, CI merge

### Single-Developer Sequential Order

```
T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 →
T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 →
T021 → T022 → T023 → T024 → T025 → T026 → T027 → T028 → T029 → T030 →
T031 → T032 → T033 → T034 → T035 → T036 → T037 → T038 → T039 → T040 →
T041 → T042 → T043 → T044 → T045
```

---

## Notes

- [P] tasks = different files, no incomplete-task dependencies — safe to run in parallel
- [US*] label maps each task to the specific user story for traceability
- Confirm tests FAIL before writing implementation (TDD per constitution Principle I)
- Commit after each logical group (e.g., after each phase checkpoint)
- Stop at any phase checkpoint to validate the story independently
- `FlexiblePanelGrid.tsx` is the most-edited file across phases — communicate edits carefully when parallelising US1 and US2
- The `react-resizable-panels` resize behavior (US2) is largely a library default — most US2 effort is wiring callbacks and matching visual style to the existing dark theme
