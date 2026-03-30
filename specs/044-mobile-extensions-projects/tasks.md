# Tasks: Mobile Extensions & Projects Relocation

**Input**: Design documents from `/specs/044-mobile-extensions-projects/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new dependencies or project init needed — all infrastructure exists. This phase ensures the branch is clean and ready.

- [x] T001 Verify branch `044-mobile-extensions-projects` is checked out and `npm install` succeeds with no errors
- [x] T002 Run `npm test && npm run lint` to confirm all existing tests pass before any changes

**Checkpoint**: Clean baseline — all existing tests green.

---

## Phase 2: Foundational (Preview Background Persistence)

**Purpose**: Change the preview rendering model from conditional mount/unmount to always-mounted with visibility toggle. This is a prerequisite for all user stories because it changes how `MobileLayout.tsx` renders overlays — and all stories modify `MobileLayout.tsx`.

- [x] T003 Add `visible` prop to `MobilePreviewSheet` in `frontend/src/components/MobilePreviewSheet.tsx` — when `visible` is `false`, render with `display: none` instead of not rendering at all; when `true`, render with `display: block`. Keep the existing `MobileSheetOverlay` wrapper but control its visibility via a CSS class or inline style. The slide-in/slide-out animation should only play on initial mount and final unmount, not on visibility toggles.
- [x] T004 Update preview rendering in `frontend/src/components/MobileLayout.tsx` — change from `{activePanel === 'preview' && currentSessionId && <MobilePreviewSheet ... />}` to always-mounted: `{currentSessionId && previewPort && <MobilePreviewSheet ... visible={activePanel === 'preview'} />}`. The preview iframe now stays alive when other panels open on top.

**Checkpoint**: Preview iframe survives when opening other panels (files, git, shell, etc.) and resumes without reload when user returns to preview.

---

## Phase 3: User Story 2 - Projects Relocation (Priority: P1) 🎯 MVP

**Goal**: Move the projects entry point from the hamburger menu to a dedicated icon in the top bar. Remove projects from hamburger. All existing project functionality (list, detail, create, start agent) continues to work through the new entry point.

**Independent Test**: Open mobile app → tap projects icon in top bar → see project list → tap project → see details → start agent. Hamburger menu no longer shows "Projects".

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T005 [P] [US2] Write test: MobileTopBar renders projects icon button and calls `onProjectsTap` when tapped, in `frontend/tests/components/mobile-extensions-projects.test.tsx`
- [x] T006 [P] [US2] Write test: MobileHamburgerMenu does NOT render a "Projects" menu item, in `frontend/tests/components/mobile-extensions-projects.test.tsx`
- [x] T007 [P] [US2] Write test: tapping projects icon in MobileLayout opens the `'projects'` panel overlay, in `frontend/tests/components/mobile-extensions-projects.test.tsx`

### Implementation for User Story 2

- [x] T008 [P] [US2] Add `onProjectsTap` and `hasProjects` props to `MobileTopBarProps` interface in `frontend/src/components/MobileTopBar.tsx`. Add a folder icon button to the right section of the top bar (between fullscreen toggle and new session button). Only show when `hasProjects` is true or when `projectTree` has items. Use same icon button styling as the existing new session button (touch target >= 44px).
- [x] T009 [P] [US2] Remove the `{ panel: 'projects', label: 'Projects', icon: ... }` entry from the `menuItems` array in `frontend/src/components/MobileHamburgerMenu.tsx`. The hamburger should now only have session-scoped items: Files, Git, Preview, Issues, Shell, Canvas, Extensions, Settings.
- [x] T010 [US2] Wire the new projects icon in `frontend/src/components/MobileLayout.tsx` — pass `onProjectsTap={() => open('projects')}` and `hasProjects={!!(projectTree && projectTree.length > 0)}` to `<MobileTopBar>`. The existing projects panel rendering (`activePanel === 'projects'` and `activePanel === 'project-detail'`) stays exactly as-is — only the entry point changes.

**Checkpoint**: Projects accessible via top bar icon. Hamburger menu has no "Projects" item. Project list, detail, create, and start agent all work.

---

## Phase 4: User Story 1 - Multiple Extensions on Mobile (Priority: P1)

**Goal**: Users can open extensions and see the full extension list with enable/disable toggles. Opening an extension shows its panel in a mobile overlay. Extensions work correctly with touch interaction and proper viewport rendering.

**Independent Test**: Open hamburger → Extensions → see list with toggles → enable two extensions → tap one to open → interact with extension UI → close → return to session.

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T011 [P] [US1] Write test: extension list shows all extensions with panel and their enabled/disabled state, in `frontend/tests/components/mobile-extensions-projects.test.tsx`
- [x] T012 [P] [US1] Write test: tapping an extension in the list opens the `'extension'` panel with that extension active, in `frontend/tests/components/mobile-extensions-projects.test.tsx`
- [x] T013 [P] [US1] Write test: closing extension panel returns to `'none'` panel (main session view), in `frontend/tests/components/mobile-extensions-projects.test.tsx`

### Implementation for User Story 1

- [x] T014 [US1] Verify and fix the existing extension list rendering in `frontend/src/components/MobileLayout.tsx` — ensure `activePanel === 'extensions'` shows all `extensionsWithPanel` entries with clear enable/disable toggle buttons (styled as blue/gray), extension display name, and a tap-to-open area. Ensure the auto-enable behavior on first open works correctly. Ensure the toggle button has a minimum 44px touch target.
- [x] T015 [US1] Verify and fix the existing extension panel rendering in `frontend/src/components/MobileLayout.tsx` — ensure `activePanel === 'extension'` correctly renders `<ExtensionPanel>` inside `<MobileSheetOverlay>` with proper iframe sizing (width: 100%, height fills available space). Ensure board command forwarding via `extensionPanelRef` works. Test with both work-report and frontend-design extensions.

**Checkpoint**: Extensions list works, individual extensions open correctly, board commands forward properly.

---

## Phase 5: User Story 4 - Quick-Switch Between Extensions (Priority: P2)

**Goal**: When viewing an extension panel, users can switch to other enabled extensions via a tab bar without going back to the extension list.

**Independent Test**: Enable 2+ extensions → open one → see tab bar at top → tap another tab → extension switches → tap gear icon → return to extension list.

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [x] T016 [P] [US4] Write test: MobileExtensionTabs renders tab bar with enabled extension names, in `frontend/tests/components/mobile-extensions-projects.test.tsx`
- [x] T017 [P] [US4] Write test: tapping a different tab calls `onSelectExtension` with the new extension name, in `frontend/tests/components/mobile-extensions-projects.test.tsx`
- [x] T018 [P] [US4] Write test: tapping gear/settings icon calls navigation back to extensions list, in `frontend/tests/components/mobile-extensions-projects.test.tsx`

### Implementation for User Story 4

- [x] T019 [US4] Create `MobileExtensionTabs` component in `frontend/src/components/MobileExtensionTabs.tsx` — a component that renders: (1) a horizontal scrollable tab bar at the top showing enabled extension names (active tab highlighted, others dimmed), (2) a gear/settings icon at the end of the tab bar that navigates back to the extension list for enable/disable management, (3) the active extension's `<ExtensionPanel>` below the tab bar. Props: `extensions`, `enabledExtensions`, `activeExtensionName`, `sessionId`, `onSelectExtension`, `onManageExtensions`, `onClose`, `extensionPanelRef`. Tab bar should use horizontal scroll with `overflow-x: auto` and `flex-shrink-0` on each tab. Active tab gets a bottom border accent. Minimum tab touch target: 44px height.
- [x] T020 [US4] Replace the single-extension rendering in `frontend/src/components/MobileLayout.tsx` — when `activePanel === 'extension'`, render `<MobileSheetOverlay title="Extensions"><MobileExtensionTabs ... /></MobileSheetOverlay>` instead of `<MobileSheetOverlay title={ext.displayName}><ExtensionPanel ... /></MobileSheetOverlay>`. Pass the gear icon callback as `onManageExtensions={() => open('extensions')}`. Wire `extensionPanelRef` through to `MobileExtensionTabs`. Ensure `handleFileChanged` board command forwarding still works (the ref chain must be preserved).
- [x] T021 [US4] Handle single-extension edge case — if only 1 extension is enabled, still show the tab bar but with just one tab plus the gear icon. This ensures the user can always reach the extension management list.

**Checkpoint**: Tab bar visible with enabled extensions. Switching tabs changes extension. Gear icon returns to extension list. Board commands still forward correctly through ref chain.

---

## Phase 6: User Story 3 - Extension Panel Rendering Quality (Priority: P2)

**Goal**: Ensure extension iframes render correctly on mobile viewports — no horizontal overflow, touch-friendly targets, keyboard handling.

**Independent Test**: Open each extension (work-report, frontend-design) on a 375px viewport → verify no horizontal scroll, all buttons tappable, forms usable with keyboard open.

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T022 [P] [US3] Write test: ExtensionPanel iframe renders with width 100% and height filling the available space inside MobileSheetOverlay, in `frontend/tests/components/mobile-extensions-projects.test.tsx`

### Implementation for User Story 3

- [x] T023 [US3] Audit and fix iframe sizing in `frontend/src/components/ExtensionPanel.tsx` — ensure the iframe element has `width: 100%`, `height: 100%`, `border: none`, and the parent container uses `flex: 1` to fill available space in the MobileSheetOverlay content area. Add `style={{ width: '100%', height: '100%' }}` if not already present.
- [x] T024 [US3] Audit and fix the work-report extension HTML in `extensions/work-report/ui/index.html` — verify it has `<meta name="viewport" content="width=device-width, initial-scale=1.0">`, uses `width: 100%` on container elements, has no fixed-width elements that would cause horizontal overflow below 320px viewport width. Fix any issues found.
- [x] T025 [US3] Audit and fix the frontend-design extension HTML in `extensions/frontend-design/ui/index.html` — same checks as T024. Verify the CSS grid `minmax(260px, 1fr)` doesn't cause horizontal overflow on 320px viewports (may need to reduce min from 260px to a responsive value).

**Checkpoint**: Both extensions render cleanly on 320px-428px viewports. No horizontal scrollbars. Touch targets usable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, test suite health, cleanup.

- [x] T026 Update existing tests in `frontend/tests/components/preview-and-extensions-fixes.test.tsx` — fix any tests broken by the preview persistence change (T003-T004) or the extension tab change (T020). The preview is now always-mounted, so tests checking for preview mount/unmount need updating.
- [x] T027 Run full test suite with `npm test` and fix any failures
- [x] T028 Run `npm run lint` and fix any lint errors
- [ ] T029 Manual verification on mobile viewport (375x667): (1) Projects icon visible, opens projects panel; (2) Hamburger has no Projects; (3) Extensions list works, enable 2+; (4) Extension tabs switch correctly; (5) Preview survives when opening extensions; (6) Board commands work (file_changed to work-report)
- [ ] T030 Push branch, create PR via `gh pr create`, wait for CI green, merge via `gh pr merge --rebase` (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational — Preview Persistence)**: Depends on Phase 1 — BLOCKS all user stories (modifies MobileLayout.tsx which all stories touch)
- **Phase 3 (US2 — Projects Relocation)**: Depends on Phase 2 — can run in parallel with Phase 4
- **Phase 4 (US1 — Multiple Extensions)**: Depends on Phase 2 — can run in parallel with Phase 3
- **Phase 5 (US4 — Quick-Switch Tabs)**: Depends on Phase 4 (builds on extension panel system)
- **Phase 6 (US3 — Rendering Quality)**: Depends on Phase 4 (needs working extension panels)
- **Phase 7 (Polish)**: Depends on all phases complete

### User Story Dependencies

- **US2 (Projects)**: Independent — only touches MobileTopBar and MobileHamburgerMenu
- **US1 (Extensions)**: Independent — touches MobileLayout extension sections
- **US4 (Quick-Switch)**: Depends on US1 — adds tab bar on top of extension panel
- **US3 (Rendering)**: Depends on US1 — audits extension rendering after panel system works

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation tasks follow dependency order
- Story complete before moving to next priority

### Parallel Opportunities

- T005, T006, T007 can all run in parallel (different test cases, same file but independent)
- T008, T009 can run in parallel (different files: MobileTopBar vs MobileHamburgerMenu)
- T011, T012, T013 can all run in parallel
- T016, T017, T018 can all run in parallel
- Phase 3 (US2) and Phase 4 (US1) can run in parallel after Phase 2

---

## Parallel Example: User Story 2

```bash
# Launch all tests for US2 together:
Task: T005 "Write test: MobileTopBar renders projects icon"
Task: T006 "Write test: MobileHamburgerMenu no Projects item"
Task: T007 "Write test: tapping projects icon opens projects panel"

# Then launch parallel implementation:
Task: T008 "Add onProjectsTap to MobileTopBar"
Task: T009 "Remove Projects from MobileHamburgerMenu"
# Then sequential:
Task: T010 "Wire projects icon in MobileLayout"
```

---

## Implementation Strategy

### MVP First (US2 — Projects Relocation)

1. Complete Phase 1: Setup
2. Complete Phase 2: Preview persistence (foundational)
3. Complete Phase 3: User Story 2 (projects in top bar)
4. **STOP and VALIDATE**: Projects work from top bar, hamburger is clean
5. Deploy/demo if ready

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready (preview persists)
2. + Phase 3 (US2) → Projects relocated → Test → Demo (MVP!)
3. + Phase 4 (US1) → Extensions fully working on mobile → Test → Demo
4. + Phase 5 (US4) → Quick-switch tabs → Test → Demo
5. + Phase 6 (US3) → Rendering quality polished → Test → Demo
6. Phase 7 → Final polish, CI, merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No backend changes, no schema changes, no new dependencies
- Extension iframes destroyed on tab switch (not kept alive) — only preview iframe persists
