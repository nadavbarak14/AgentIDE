# Tasks: Mobile Preview UX Redesign

**Input**: Design documents from `/specs/030-mobile-preview-ux/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `frontend/src/`, `frontend/tests/` (frontend only — no backend changes in this feature)

---

## Phase 1: Setup

**Purpose**: No new project initialization needed — this is a modification of an existing codebase. This phase covers only prerequisite cleanup.

- [x] T001 Delete `frontend/src/components/MobileSessionView.tsx` and remove all imports referencing it across the codebase
- [x] T002 [P] Delete `frontend/src/components/MobileTerminalOutput.tsx` and remove all imports referencing it across the codebase

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Create the shared hooks that all user stories depend on. MUST complete before any user story work.

**CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 Create `useVisualViewport` hook in `frontend/src/hooks/useVisualViewport.ts` — listen to `window.visualViewport` resize events, expose `keyboardOpen` (true when `innerHeight - visualViewport.height > 150`), `viewportHeight`, `keyboardOffset` (pixels below visual viewport), and `isMobile` (viewport width < 640px). Debounce to 50ms. Fallback gracefully when `visualViewport` is unavailable (desktop browsers).
- [x] T004 [P] Create `useClaudeMode` hook in `frontend/src/hooks/useClaudeMode.ts` — accept `session.needsInput`, `session.status`, and a terminal output buffer (string[]). Return `mode: 'permission' | 'generating' | 'input' | 'idle'`. Permission mode: `needsInput === true` AND last 5 lines match `/\(y\/n\)|Allow|Deny|approve|reject|permission/i`. Generating: `needsInput === false && status === 'active'`. Input: `needsInput === true` and not permission. Idle: status is `completed` or `failed`. Also expose `isScrolledUp: boolean` (passed through from caller).
- [x] T005 [P] Write unit tests for `useVisualViewport` hook in `frontend/tests/hooks/useVisualViewport.test.ts` — test keyboard detection (mock visualViewport height changes), isMobile flag at various widths, debouncing behavior, and graceful fallback when visualViewport is undefined
- [x] T006 [P] Write unit tests for `useClaudeMode` hook in `frontend/tests/hooks/useClaudeMode.test.ts` — test all four mode transitions: permission detection with various prompt patterns ("Allow? (y/n)", "Do you want to proceed?"), generating state, input state, idle state. Test edge cases: empty output buffer, rapid state changes

**Checkpoint**: Foundation ready — hooks tested and available for all user stories

---

## Phase 3: User Story 1 — Unified Mobile Layout (Priority: P1) MVP

**Goal**: Remove all mobile-specific rendering. One session fills the viewport on mobile. No "Adyx" headline. Desktop SessionCard renders at all viewport sizes.

**Independent Test**: Open app at 375px width with one active session. Session card fills screen, standard toolbar visible, no bottom tab bar, no "Adyx" headline, no page scroll.

### Tests for User Story 1

- [x] T007 [P] [US1] Write integration test in `frontend/tests/components/MobileLayout.test.tsx` — render Dashboard at 375px viewport width with one active session. Assert: no element with text "Adyx" visible, no element with `data-testid="mobile-tab-bar"`, session card fills container, toolbar buttons (Files, Git, Preview) are present in DOM

### Implementation for User Story 1

- [x] T008 [US1] Remove `isMobileViewport` state, `mobileTab` state, and the entire mobile render block (`if (isMobileViewport) { ... }`, approximately lines 130-133 and 984-1050) from `frontend/src/components/SessionCard.tsx`. Remove the `useState` and `matchMedia` listener for `isMobileViewport`. The desktop render path now handles all viewports.
- [x] T009 [US1] Modify `frontend/src/pages/Dashboard.tsx` — remove the "Adyx" `<h1>` headline (line ~788), remove mobile session count badge (lines ~820-835), remove mobile-specific `sm:` text variants in the top bar. Use `useVisualViewport` hook to get `isMobile`. When `isMobile`, override `maxVisible` to `1` so only one session displays.
- [x] T010 [US1] Modify `frontend/src/components/SessionGrid.tsx` — when only one session is displayed (`activeSessions.length === 1`), use `gridTemplateColumns: '1fr'` and ensure the card fills the full available height without `auto-rows-fr` grid creating extra space. Remove the `overflow-auto` on the grid container for single-session mode to prevent page scroll.
- [x] T011 [US1] Remove `isMobile` state and `matchMedia` listener from `frontend/src/components/SessionQueue.tsx` (lines ~51-60). Remove the `isMobile && !showAdvanced` collapsed advanced options section (lines ~134-140). The sidebar overlay behavior already works for mobile via the Dashboard's overlay logic.

**Checkpoint**: US1 complete — mobile shows single full-screen session with desktop toolbar, no mobile-specific code paths

---

## Phase 4: User Story 6 — Claude Code Action Bar (Priority: P1)

**Goal**: Contextual action bar for Claude Code on mobile — Accept/Reject for permissions, Stop for generation, Tab/↑/↓/Esc for input, Continue for idle.

**Independent Test**: Start a session on mobile. During permission prompt: Accept/Reject buttons visible, tapping sends y\n or n\n. During generation: Stop button visible, sends Ctrl+C. During input: Tab/↑/↓/Esc keys available.

### Tests for User Story 6

- [x] T012 [P] [US6] Write component tests in `frontend/tests/components/ClaudeActionBar.test.tsx` — render ClaudeActionBar in each mode (permission, generating, input, idle). Assert correct buttons visible per mode. Simulate button taps and assert `onSend` called with correct byte sequences: Accept → "y\n", Reject → "n\n", Stop → "\x03", Tab → "\t", Arrow Up → "\x1b[A", Arrow Down → "\x1b[B", Escape → "\x1b", Continue → "\n"

### Implementation for User Story 6

- [x] T013 [US6] Create `ClaudeActionBar` component in `frontend/src/components/ClaudeActionBar.tsx` — accept `mode`, `onSend`, `keyboardOffset`, `isScrolledUp`, `onScrollToBottom` props. Render mode-specific buttons per plan: permission mode shows Accept (green) + Reject (red), generating shows Stop (red), input shows Tab + ↑ + ↓ + Esc + Send, idle shows Continue. Position with `position: fixed`, `bottom` = `keyboardOffset` px. Full width, ~44px height, `bg-gray-800/95 backdrop-blur` styling. Only render when `isMobile` (passed as prop or from context).
- [x] T014 [US6] Add terminal output buffer tracking to `frontend/src/components/SessionCard.tsx` — create a `useRef<string[]>` ring buffer (last 10 lines) that captures decoded terminal output from the WebSocket `onBinaryData` callback. Pass this buffer to `useClaudeMode` hook along with `session.needsInput` and `session.status`. Wire the resulting `mode` to `ClaudeActionBar`. Pass `sendInput` from `useWebSocket` as the `onSend` prop so action bar buttons can inject keystrokes into the PTY.
- [x] T015 [US6] Wire `ClaudeActionBar` positioning to `useVisualViewport` in `frontend/src/components/SessionCard.tsx` — pass `keyboardOffset` from the hook to the action bar so it repositions above the on-screen keyboard. When keyboard is closed, action bar sits at viewport bottom.

**Checkpoint**: US6 complete — Claude Code is usable on mobile with one-tap Accept/Reject, Stop, Tab, and special keys

---

## Phase 5: User Story 2 — Session Switching (Priority: P1)

**Goal**: Compact session selector on mobile — tap to see all sessions, tap to switch, shows waiting indicators.

**Independent Test**: Create two sessions at 375px width. Session selector visible. Tap it to see both sessions. Tap the other to switch. Only the selected session visible.

### Tests for User Story 2

- [x] T016 [P] [US2] Write component tests in `frontend/tests/components/MobileSessionSelector.test.tsx` — render with 3 sessions (one current, one waiting). Assert: current session title visible, waiting count badge shows "1". Simulate tap on title → dropdown opens showing all 3 sessions with status indicators. Simulate tap on different session → `onSelect` called with correct ID. Test with 1 session → selector is minimal (no dropdown arrow).

### Implementation for User Story 2

- [x] T017 [US2] Create `MobileSessionSelector` component in `frontend/src/components/MobileSessionSelector.tsx` — accept `sessions`, `currentSessionId`, `waitingCount`, `onSelect`, `onNewSession` props. Render compact strip: current session title (truncated) + ▾ dropdown arrow + "+" new session button + amber waiting badge with count. Tap title opens dropdown overlay listing all sessions with status dot (green/amber/red), title, and needs-input pulse indicator. Tap a session calls `onSelect` and closes dropdown. Tap outside closes dropdown. When only 1 session, hide the dropdown arrow.
- [x] T018 [US2] Integrate `MobileSessionSelector` into `frontend/src/pages/Dashboard.tsx` — when `isMobile`, replace the top bar content (headline + buttons) with `MobileSessionSelector`. Pass `activeSessions`, `currentSessionId`, waiting count (computed from `activeSessions.filter(s => s.needsInput && s.id !== currentSessionId).length`), `handleFocusSession` as `onSelect`, and sidebar open toggle as `onNewSession`.

**Checkpoint**: US2 complete — users can switch sessions in 1-2 taps on mobile

---

## Phase 6: User Story 8 — Preview on Mobile (Priority: P1)

**Goal**: Preview iframe fills the panel edge-to-edge on mobile. No device bezel. Desktop viewport mode forced.

**Independent Test**: Open preview panel at 375px width. Iframe fills available panel space with no bezel, no extra padding. Touch events work in iframe.

### Tests for User Story 8

- [x] T019 [P] [US8] Write component test in `frontend/tests/components/LivePreviewMobile.test.tsx` — render LivePreview with `isMobile` context/prop. Assert: viewport mode defaults to 'desktop' (not 'mobile'), no device bezel wrapper div rendered, iframe has `w-full h-full` classes

### Implementation for User Story 8

- [x] T020 [US8] Modify `frontend/src/components/LivePreview.tsx` — accept an `isMobile` prop (or read from `useVisualViewport` context). When `isMobile` is true: force `viewportMode` to `'desktop'` on initial render (ignore saved panel state for viewport mode), hide the desktop/mobile/custom viewport toggle buttons to save space, keep only the address bar (compact), reload button, and open-in-new-tab button. Ensure the iframe renders with `className="w-full h-full border-0"` (the desktop default path) — no device bezel wrapper.

**Checkpoint**: US8 complete — preview fills mobile screen naturally, touch-interactive

---

## Phase 7: User Story 3 — Keyboard-Aware Layout (Priority: P1)

**Goal**: When on-screen keyboard opens, chrome auto-hides, terminal input stays visible, content area maximized above keyboard.

**Independent Test**: At 375px width, tap terminal input. Simulate keyboard open (visualViewport.height reduced by 300px). Toolbar and session header should hide. Terminal content visible above keyboard. Dismiss keyboard → chrome restores.

### Tests for User Story 3

- [x] T021 [P] [US3] Write integration test in `frontend/tests/components/KeyboardLayout.test.tsx` — render SessionCard, simulate `useVisualViewport` returning `keyboardOpen: true`. Assert: toolbar div has `hidden` or `h-0` class, session header is collapsed/hidden, terminal container height adjusts. Simulate `keyboardOpen: false` → toolbar and header restore.

### Implementation for User Story 3

- [x] T022 [US3] Modify `frontend/src/components/SessionCard.tsx` — use `useVisualViewport` hook (or accept `keyboardOpen` + `isMobile` as props). When `keyboardOpen && isMobile`: hide the toolbar (`display: none` or `className="hidden"`), collapse the session header to zero height or hide it entirely, let the terminal container expand to fill the remaining space above the action bar + keyboard. When keyboard closes, restore toolbar and header.
- [x] T023 [US3] Set the main app container height to use `visualViewport.height` on mobile in `frontend/src/pages/Dashboard.tsx` — instead of `h-screen` (which doesn't account for keyboard), use inline `style={{ height: viewportHeight }}` from `useVisualViewport` when `isMobile`. This ensures the entire layout fits the visible area above the keyboard without page-level scroll.

**Checkpoint**: US3 complete — typing on mobile is comfortable, keyboard never covers content

---

## Phase 8: User Story 4 — Waiting Session Alerts (Priority: P1)

**Goal**: Floating alert when background sessions need input. Visible even with keyboard open. Single-tap to switch.

**Independent Test**: Run two sessions. Session B enters needsInput while viewing Session A. Amber alert appears showing "Session B needs input". Tap it → switches to Session B.

### Tests for User Story 4

- [x] T024 [P] [US4] Write component tests in `frontend/tests/components/WaitingSessionAlert.test.tsx` — render with 1 waiting session: assert pill shows session title + "needs input". Render with 2 waiting: assert shows count "2 sessions waiting". Simulate tap → `onSwitch` called with first waiting session ID. Render with 0 waiting → nothing rendered.

### Implementation for User Story 4

- [x] T025 [US4] Create `WaitingSessionAlert` component in `frontend/src/components/WaitingSessionAlert.tsx` — accept `waitingSessions` (Session[]) and `onSwitch` callback. When `waitingSessions.length > 0`: render a floating pill with `position: fixed`. Show session title for 1 waiting, or "N sessions waiting" for multiple. Pulsing amber styling (`bg-amber-500/90 animate-pulse`). Tap calls `onSwitch(waitingSessions[0].id)`. Position `bottom` = `keyboardOffset + actionBarHeight + 8px` (accept these as props) so it sits above both keyboard and action bar.
- [x] T026 [US4] Integrate `WaitingSessionAlert` into `frontend/src/pages/Dashboard.tsx` — compute waiting sessions: `activeSessions.filter(s => s.needsInput && s.id !== currentSessionId)`. Render `WaitingSessionAlert` at the root level (outside session card) only when `isMobile`. Pass `handleFocusSession` as `onSwitch`. Pass `keyboardOffset` from `useVisualViewport`.

**Checkpoint**: US4 complete — users never miss a waiting session on mobile

---

## Phase 9: User Story 7 — Terminal Scrolling (Priority: P2)

**Goal**: Smooth touch scrolling in terminal. Floating "jump to bottom" button when scrolled up.

**Independent Test**: Run a session with long output at 375px. Swipe up — smooth scroll. Button appears. Tap it — scrolls to bottom.

### Tests for User Story 7

- [x] T027 [P] [US7] Write component test in `frontend/tests/components/ScrollToBottomButton.test.tsx` — render with `visible: true`, assert button is in DOM. Simulate tap → `onScrollToBottom` called. Render with `visible: false` → button not in DOM.

### Implementation for User Story 7

- [x] T028 [US7] Create `ScrollToBottomButton` component in `frontend/src/components/ScrollToBottomButton.tsx` — floating button "↓" positioned above the action bar (or at bottom when no action bar). Accept `visible`, `onScrollToBottom`, `bottomOffset` props. Render only when `visible`. Styling: `fixed`, rounded circle, `bg-gray-700/80 text-white`, 36x36px touch target.
- [x] T029 [US7] Add scroll position tracking to `frontend/src/hooks/useTerminal.ts` — after terminal is initialized, subscribe to `terminal.onScroll` event. Track whether user is scrolled up: compare viewport Y position to `terminal.buffer.active.length - terminal.rows`. Expose `isScrolledUp: boolean` and `scrollToBottom()` function in the hook return value. Also set `terminal.options.scrollSensitivity = 3` for smoother touch scrolling feel.
- [x] T030 [US7] Wire `ScrollToBottomButton` into `frontend/src/components/SessionCard.tsx` — read `isScrolledUp` and `scrollToBottom` from the terminal hook (exposed via TerminalView ref or callback). Render `ScrollToBottomButton` when `isMobile && isScrolledUp`. Position above the action bar.

**Checkpoint**: US7 complete — terminal scrolling is smooth and easy on mobile

---

## Phase 10: User Story 5 — Session Creation on Mobile (Priority: P2)

**Goal**: New session form accessible as overlay on mobile. Create session → auto-select and show.

**Independent Test**: At 375px, tap "+" button. Overlay form appears. Fill out and submit. New session auto-selected and fills viewport.

### Implementation for User Story 5

- [x] T031 [US5] Ensure the existing sidebar overlay behavior in `frontend/src/pages/Dashboard.tsx` works for session creation on mobile — the `SessionQueue` already renders as a full-screen overlay on mobile via the `fixed right-0 top-0 bottom-0 z-50 w-full sm:w-80` classes. Verify: the "+" button in `MobileSessionSelector` opens the sidebar overlay, creating a session auto-closes the overlay (already implemented in the `onCreateSession` wrapper), and the new session is auto-selected. Make touch targets in `SessionQueue` form at least 44px height for mobile usability.

**Checkpoint**: US5 complete — full session lifecycle works on mobile

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup, edge cases, and cross-story integration

- [x] T032 Remove any remaining `sm:` Tailwind breakpoint classes in `frontend/src/pages/Dashboard.tsx` top bar that reference mobile-specific text or layout that was not already cleaned in US1
- [ ] T033 [P] Verify edge case: device rotation mid-session — ensure `useVisualViewport` updates `isMobile` and `viewportHeight` on orientation change, and the layout reflows without reload
- [ ] T034 [P] Verify edge case: all sessions completed/failed on mobile — empty state shows "Create a session" prompt, session selector is hidden
- [x] T035 Run full test suite (`npm test`) and fix any failures introduced by the mobile UX changes
- [x] T036 [P] Run linting (`npm run lint`) and fix any issues
- [ ] T037 Visual verification: open the app on a real iPhone (or Chrome DevTools mobile emulator) and walk through the quickstart.md verification checklist — confirm all items pass
- [ ] T038 Push branch, wait for CI green, create PR (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — delete dead mobile components immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — hooks need clean codebase. BLOCKS all user stories.
- **US1 (Phase 3)**: Depends on Phase 2 (needs `useVisualViewport` for `isMobile` flag). This is the **MVP**.
- **US6 (Phase 4)**: Depends on Phase 2 (`useClaudeMode`) + Phase 3 (clean SessionCard)
- **US2 (Phase 5)**: Depends on Phase 3 (Dashboard changes). Can run parallel with US6.
- **US8 (Phase 6)**: Depends on Phase 3. Can run parallel with US6 and US2.
- **US3 (Phase 7)**: Depends on Phase 2 (`useVisualViewport`) + Phase 3 (SessionCard cleanup)
- **US4 (Phase 8)**: Depends on Phase 2 + Phase 3. Can run parallel with US3.
- **US7 (Phase 9)**: Depends on Phase 4 (action bar positioning). Can run parallel with US3/US4.
- **US5 (Phase 10)**: Depends on Phase 5 (MobileSessionSelector with "+" button)
- **Polish (Phase 11)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — no other story dependencies. **MVP scope.**
- **US6 (P1)**: Depends on US1 (needs clean SessionCard without mobile branch)
- **US2 (P1)**: Depends on US1 (needs Dashboard without headline)
- **US8 (P1)**: Depends on US1 (needs clean LivePreview context)
- **US3 (P1)**: Depends on US1 (needs clean SessionCard)
- **US4 (P1)**: Depends on US1 (needs Dashboard mobile layout)
- **US7 (P2)**: Depends on US6 (scroll button positioned relative to action bar)
- **US5 (P2)**: Depends on US2 (MobileSessionSelector provides the "+" button)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Hooks/utilities before components
- Components before integration
- Integration before verification

### Parallel Opportunities

- **Phase 1**: T001 and T002 can run in parallel (different files)
- **Phase 2**: T003 and T004 can run in parallel (different hook files). T005 and T006 in parallel (different test files).
- **After Phase 3 completes**: US6, US2, US8, US3, US4 can start in parallel (different files, different components)
- **All test tasks** marked [P] can run in parallel within their phase

---

## Parallel Example: After Phase 3 (MVP) Completes

```bash
# These can all run concurrently after US1 is done:

# Agent A: US6 - Claude Action Bar
Task T012: "Write ClaudeActionBar tests"
Task T013: "Create ClaudeActionBar component"

# Agent B: US2 - Session Selector
Task T016: "Write MobileSessionSelector tests"
Task T017: "Create MobileSessionSelector component"

# Agent C: US8 - Preview on Mobile
Task T019: "Write LivePreview mobile test"
Task T020: "Modify LivePreview for mobile"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Delete dead mobile components
2. Complete Phase 2: Create foundational hooks + tests
3. Complete Phase 3: US1 — unified layout
4. **STOP and VALIDATE**: Test at 375px width — single session fills screen, desktop toolbar works
5. This alone is a major improvement over current state

### Incremental Delivery

1. Phase 1 + 2 → Foundation ready
2. Add US1 → Test independently → **MVP deployed** (unified layout)
3. Add US6 → Test → Claude Code is usable on mobile (Accept/Reject/Stop/Tab)
4. Add US2 → Test → Session switching works
5. Add US8 → Test → Preview works naturally on mobile
6. Add US3 → Test → Keyboard-aware layout
7. Add US4 → Test → Waiting session alerts
8. Add US7 → Test → Smooth terminal scrolling
9. Add US5 → Test → Full session lifecycle on mobile
10. Polish → CI green → PR

### Parallel Team Strategy

With 3 agents after Phase 3:
- **Agent A**: US6 (action bar) → US7 (scroll)
- **Agent B**: US2 (selector) → US5 (create session) → US4 (alerts)
- **Agent C**: US8 (preview) → US3 (keyboard)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable after its dependencies
- No backend changes — all tasks are frontend only
- No new npm dependencies — uses built-in browser APIs
- Total: 38 tasks across 11 phases
- The ClaudeActionBar (US6) is the most impactful mobile UX feature — prioritize after MVP
