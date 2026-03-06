# Tasks: Preview Device Presets & Layout Persistence

**Input**: Design documents from `/specs/025-preview-device-presets/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the device presets constant file and backend schema migration that all stories depend on

- [ ] T001 [P] Create device presets constants with 11 devices (6 phones, 5 tablets) grouped by category in `frontend/src/constants/devicePresets.ts` — export `DEVICE_PRESETS` array with `{ id, name, category, width, height }` and a `getPresetById(id)` helper, plus `DevicePreset` and `DeviceCategory` types
- [ ] T002 [P] Add `mobile_device_id` column migration to `backend/src/models/db.ts` — add `ALTER TABLE panel_states ADD COLUMN mobile_device_id TEXT DEFAULT NULL` in the migration section (follow existing migration pattern for v6/v7)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend and frontend plumbing for the new `mobileDeviceId` field — MUST complete before user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 [P] Add `mobileDeviceId: string | null` to `PanelState` interface in `backend/src/models/types.ts`
- [ ] T004 [P] Add `mobileDeviceId` to `PanelStateData` interface in `frontend/src/services/api.ts`
- [ ] T005 Update `rowToPanelState()` mapping to include `mobile_device_id` (default null) and update `savePanelState()` INSERT to include `mobile_device_id` column in `backend/src/models/repository.ts`
- [ ] T006 Update GET `/api/sessions/:id/panel-state` to return `mobileDeviceId` (default null) and PUT to accept/validate `mobileDeviceId` (string or null) in `backend/src/api/routes/sessions.ts`
- [ ] T007 Add `mobileDeviceId: string | null` to `PanelStateValues` in `frontend/src/hooks/usePanel.ts` — add state variable, include in default state (null), include in auto-save dependency array, include in `restoreState()`, and include in save payload

**Checkpoint**: Backend accepts and persists `mobileDeviceId`; frontend sends and restores it. No UI changes yet.

---

## Phase 3: User Story 1 — Collapsed Screenshot/Recording Mode Selector (Priority: P1) MVP

**Goal**: Replace the 4 separate View/Full toggle buttons with dropdown menus on the screenshot and record action buttons

**Independent Test**: Click screenshot button → dropdown with View/Full appears → select one → action triggers and dropdown closes

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [ ] T008 [P] [US1] Unit test for screenshot dropdown behavior in `frontend/tests/components/PreviewOverlay.test.tsx` — test: clicking screenshot button opens dropdown, selecting "View" calls `bridge.captureScreenshot('viewport')`, selecting "Full" calls `bridge.captureScreenshot('full')`, clicking outside closes dropdown, Escape closes dropdown
- [ ] T009 [P] [US1] Unit test for recording dropdown behavior in `frontend/tests/components/PreviewOverlay.test.tsx` — test: clicking record button (not recording) opens dropdown, selecting mode starts recording, clicking record button while recording stops immediately (no dropdown), dropdown disabled during recording

### Implementation for User Story 1

- [ ] T010 [US1] Refactor `PreviewOverlay.tsx` in `frontend/src/components/PreviewOverlay.tsx` — remove the 4 View/Full toggle buttons (screenshot mode selector lines ~147-170, recording mode selector lines ~182-208) and their state variables (`screenshotMode`, `recordingMode`). Replace with: (a) screenshot button that toggles a `screenshotDropdownOpen` state, (b) recording button that toggles a `recordDropdownOpen` state (only when not recording; if recording, stop immediately). Add `useRef` for each dropdown and `useEffect` click-outside + Escape handlers following the ProjectPicker pattern. Each dropdown renders two items: "View" (viewport) and "Full" (full page). Selecting an item triggers the action immediately (`bridge.captureScreenshot(mode)` or `bridge.startRecording(mode)`) and closes the dropdown. Only one dropdown can be open at a time.

**Checkpoint**: Screenshot/recording buttons now show dropdowns. 4 toggle buttons removed. All acceptance scenarios for US1 verified.

---

## Phase 4: User Story 2 — Mobile Device Presets (Priority: P1)

**Goal**: Replace single fixed-size mobile viewport with a device preset picker dropdown showing 11 devices grouped by category

**Independent Test**: Click mobile viewport button → device dropdown appears with Phones/Tablets sections → select device → preview resizes to device dimensions with appropriate frame

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [ ] T011 [P] [US2] Unit test for device preset dropdown in `frontend/tests/components/LivePreview.test.tsx` — test: clicking mobile button opens device picker, presets grouped by category, selecting phone preset applies phone dimensions and frame, selecting tablet preset applies tablet dimensions and frame, clicking desktop button returns to full width, dropdown closes on outside click/Escape, current preset highlighted
- [ ] T012 [P] [US2] Unit test for device presets constant in `frontend/tests/constants/devicePresets.test.ts` — test: all 11 presets present, each has valid id/name/category/width/height, `getPresetById` returns correct preset, `getPresetById` returns null for unknown id, categories are 'phone' or 'tablet'

### Implementation for User Story 2

- [ ] T013 [US2] Update mobile viewport button in `frontend/src/components/LivePreview.tsx` — change the mobile button's `onClick` from `onViewportChange?.('mobile')` to toggling a `deviceDropdownOpen` state. Add `useRef` + click-outside + Escape handler. Render dropdown below the viewport toggle bar with device presets from `DEVICE_PRESETS` grouped by category (Phones header, then phone items; Tablets header, then tablet items). Each item shows device name and dimensions. Highlight the currently active preset. On select: call `onDevicePresetSelect?.(preset.id)` and close dropdown.
- [ ] T014 [US2] Add `onDevicePresetSelect` prop and `selectedDeviceId` prop to `LivePreview` component in `frontend/src/components/LivePreview.tsx` — accept these new props from parent, pass them through the viewport mode logic
- [ ] T015 [US2] Update mobile frame rendering in `frontend/src/components/LivePreview.tsx` — when `viewportMode === 'mobile'`, look up the selected device from `DEVICE_PRESETS` using `selectedDeviceId` (fallback to first phone preset). Use the preset's width/height for the iframe dimensions. For phone presets: keep existing phone frame (notch + home indicator). For tablet presets: use a tablet frame (squared corners, no notch, thinner bezels). Apply proportional scaling when the device exceeds the container size (reuse custom viewport scaling logic).
- [ ] T016 [US2] Wire device preset selection through SessionCard in `frontend/src/components/SessionCard.tsx` — pass `panel.mobileDeviceId` as `selectedDeviceId` to `LivePreview`, pass `(id) => panel.setMobileDeviceId(id)` as `onDevicePresetSelect`. When a device is selected, also set `panel.setPreviewViewport('mobile')` if not already in mobile mode.
- [ ] T017 [US2] Add `setMobileDeviceId` setter to usePanel hook in `frontend/src/hooks/usePanel.ts` — add the setter function that updates the `mobileDeviceId` state, which is already in the auto-save dependency array from T007

**Checkpoint**: Mobile button shows device picker. Selecting a device resizes preview with correct frame. All 11 presets available. All acceptance scenarios for US2 verified.

---

## Phase 5: User Story 3 — Device Preset Persistence (Priority: P2)

**Goal**: Selected device preset is saved per session and restored on page reload

**Independent Test**: Select a device preset → refresh page → same preset is active and preview shows correct dimensions

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [ ] T018 [P] [US3] Integration test for device preset persistence in `backend/tests/panel-state.test.ts` — test: PUT panel-state with `mobileDeviceId: 'iphone-15-pro'` → GET returns same value, PUT with `mobileDeviceId: null` → GET returns null, default value is null for new sessions
- [ ] T019 [P] [US3] Unit test for preset restore in `frontend/tests/hooks/usePanel.test.ts` — test: when restored state has `mobileDeviceId`, it is set correctly, when `mobileDeviceId` references unknown preset the state still loads (UI handles fallback), when `mobileDeviceId` is null the state loads with null

### Implementation for User Story 3

- [ ] T020 [US3] Verify end-to-end persistence flow — confirm that selecting a device preset in the UI triggers auto-save (T007 wiring), the backend stores `mobile_device_id` (T005/T006), and on reload `restoreState()` sets the `mobileDeviceId` which flows through SessionCard (T016) to LivePreview (T014) and the correct preset is shown. Fix any gaps in the save/restore chain. Add fallback in LivePreview: if restored `mobileDeviceId` doesn't match any preset, fall back to first phone preset.

**Checkpoint**: Device preset persists across page reloads. Per-session isolation works. All acceptance scenarios for US3 verified.

---

## Phase 6: User Story 4 — Terminal Position Persistence (Priority: P2)

**Goal**: Terminal position (center/bottom) and exact height are reliably persisted without auto-switching overriding explicit user choices

**Independent Test**: Move terminal to bottom → resize to 60% → refresh → terminal is at bottom with 60% height

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [ ] T021 [P] [US4] Unit test for terminal position persistence in `frontend/tests/hooks/usePanel.test.ts` — test: explicit user toggle of terminal position sets `userSetTerminalPosition` flag, when flag is true auto-switching logic is skipped, when all panels close the flag resets, restored terminal position is respected on load

### Implementation for User Story 4

- [ ] T022 [US4] Add `userSetTerminalPosition` ref to usePanel hook in `frontend/src/hooks/usePanel.ts` — add a `useRef<boolean>(false)` that tracks whether the user has explicitly set terminal position. Set to `true` when `setTerminalPosition` is called from user action (not from restore). In the auto-switching logic (where terminal moves from center→bottom when panels open and bottom→center when panels close), check this flag: if `true`, skip the auto-switch. Reset the flag to `false` when all panels are closed (leftPanel === 'none' && rightPanel === 'none' && bottomPanel === 'none'). On `restoreState()`, set the ref to `true` if the restored `terminalPosition` is 'bottom' (so the restored position isn't overridden by auto-switching).

**Checkpoint**: Terminal position and height are correctly restored after page reload. Auto-switching doesn't override explicit user choice. All acceptance scenarios for US4 verified.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all stories

- [ ] T023 Verify all dropdowns close on Escape key — test across PreviewOverlay (screenshot/recording dropdowns) and LivePreview (device preset dropdown); ensure consistent behavior per FR-013
- [ ] T024 Run full test suite (`npm test && npm run lint`) and fix any failures
- [ ] T025 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001 and T002 run in parallel
- **Foundational (Phase 2)**: Depends on Phase 1 — T003/T004 parallel, then T005→T006→T007
- **US1 (Phase 3)**: Depends on Phase 2 — but does NOT need `mobileDeviceId` plumbing, only needs Phase 2 complete for consistency
- **US2 (Phase 4)**: Depends on Phase 2 (needs `mobileDeviceId` in usePanel) and Phase 1 (needs devicePresets.ts)
- **US3 (Phase 5)**: Depends on US2 (Phase 4) — needs device preset selection working to test persistence
- **US4 (Phase 6)**: Depends on Phase 2 only — independent of US1/US2/US3
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Independent — only modifies PreviewOverlay.tsx
- **US2 (P1)**: Independent — modifies LivePreview.tsx, SessionCard.tsx, usePanel.ts
- **US3 (P2)**: Depends on US2 — needs device selection to exist before testing persistence
- **US4 (P2)**: Independent — only modifies usePanel.ts (different section than US2)

### Parallel Opportunities

- T001 || T002 (Phase 1 — different files)
- T003 || T004 (Phase 2 — different files)
- T008 || T009 (US1 tests — same file but independent test suites)
- T011 || T012 (US2 tests — different files)
- T018 || T019 (US3 tests — different files)
- US1 (Phase 3) || US4 (Phase 6) — fully independent, different files
- US1 (Phase 3) || US2 (Phase 4) — fully independent, different files

---

## Parallel Example: User Story 2

```bash
# Launch tests in parallel:
Task: "Unit test for device preset dropdown in frontend/tests/components/LivePreview.test.tsx"
Task: "Unit test for device presets constant in frontend/tests/constants/devicePresets.test.ts"

# Then implementation (sequential within story):
Task: "Update mobile viewport button with dropdown in LivePreview.tsx"
Task: "Add onDevicePresetSelect/selectedDeviceId props to LivePreview"
Task: "Update mobile frame rendering for dynamic dimensions"
Task: "Wire device preset through SessionCard"
Task: "Add setMobileDeviceId setter to usePanel"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001, T002)
2. Complete Phase 2: Foundational (T003–T007)
3. Complete Phase 3: User Story 1 (T008–T010)
4. **STOP and VALIDATE**: Screenshot/recording dropdowns work, toolbar decluttered
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 → Toolbar cleanup (MVP!)
3. Add US2 → Device preset picker
4. Add US3 → Preset persistence
5. Add US4 → Terminal position fix
6. Polish → CI green, merge

### Parallel Strategy

With two developers:
1. Team completes Setup + Foundational together
2. Once foundational is done:
   - Developer A: US1 (PreviewOverlay) + US3 (persistence verification)
   - Developer B: US2 (LivePreview device picker) + US4 (terminal fix)
3. Polish together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Device presets are static constants — no DB storage for the preset definitions themselves
- Only `mobile_device_id` (the selected preset ID) is persisted in the DB
- Dropdown pattern: follow ProjectPicker.tsx (useState + useRef + mousedown listener)
- Frame styling: phones get rounded frame with notch/home indicator; tablets get squared frame without notch
- Commit after each task or logical group
