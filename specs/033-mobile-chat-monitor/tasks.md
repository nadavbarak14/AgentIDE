# Tasks: Mobile Chat Monitor UX

**Input**: Design documents from `/specs/033-mobile-chat-monitor/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md
**Design**: Design A — Chat Monitor (selected by user from interactive mockup comparison)

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Breakpoint change and shared mobile infrastructure

- [x] T001 Update mobile breakpoint from 640px to 768px in `frontend/src/hooks/useVisualViewport.ts` (change `width < 640` to `width < 768`)
- [x] T002 Create `useMobilePanel` hook for mobile overlay state management in `frontend/src/hooks/useMobilePanel.ts` — tracks which overlay is open (none, hamburger, sessions, preview, files, git, shell), provides open/close/toggle functions
- [x] T003 Create `MobileSheetOverlay` generic full-screen sheet component in `frontend/src/components/MobileSheetOverlay.tsx` — slides up from bottom via CSS `translateY`, 300ms ease-out, takes children + onClose prop, renders portal over content

**Checkpoint**: Shared mobile infrastructure ready.

---

## Phase 2: Foundational — Mobile Layout Shell

**Purpose**: The top-level mobile layout that replaces the desktop layout on phones. MUST complete before user stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Create `MobileLayout` wrapper component in `frontend/src/components/MobileLayout.tsx` — flex column filling viewport height (uses `viewportHeight` from `useVisualViewport`), renders MobileTopBar at top, content area (flex:1), and MobileActionBar at bottom. Receives session state as props.
- [x] T005 Create `MobileTopBar` component in `frontend/src/components/MobileTopBar.tsx` — slim bar (~40px): hamburger icon (left), session status dot + session name + truncated project path (center), notification badge with waiting count (right). Emits onHamburgerTap, onSessionTap callbacks.
- [x] T006 Modify `Dashboard.tsx` to conditionally render `MobileLayout` when `isMobile` is true in `frontend/src/pages/Dashboard.tsx` — wrap the existing desktop layout in an `else` branch; mobile branch renders `<MobileLayout>` with terminal view as children. Desktop code path must remain completely unchanged.
- [ ] T007 [P] Write unit test for `MobileLayout` in `frontend/tests/components/MobileLayout.test.tsx` — verify it renders top bar, content, and action bar; verify it does NOT render when isMobile is false
- [ ] T008 [P] Write unit test for `MobileTopBar` in `frontend/tests/components/MobileTopBar.test.tsx` — verify session name, badge count, hamburger icon render; verify callbacks fire on tap

**Checkpoint**: On mobile (<768px), app renders MobileLayout with top bar + empty content area + action bar. Desktop unchanged.

---

## Phase 3: User Story 1 — Full-Screen Claude Terminal (Priority: P1) 🎯 MVP

**Goal**: Claude terminal fills the entire screen on mobile with only top bar and action bar visible.

**Independent Test**: Open app on phone viewport (<768px) with active session. Terminal fills full width/height minus top bar and action bar. No tab bar, no split panels, no preview chrome.

### Tests for User Story 1

- [ ] T009 [P] [US1] Write unit test for full-screen terminal rendering in `frontend/tests/components/MobileLayout.test.tsx` — verify TerminalView is rendered full-width in content area, no panel tabs visible, no split layout

### Implementation for User Story 1

- [x] T010 [US1] Wire `TerminalView` as the default content inside `MobileLayout` in `frontend/src/components/MobileLayout.tsx` — render the active session's `TerminalView` component directly in the flex:1 content area, bypassing the desktop panel system entirely. Terminal gets full width and remaining height.
- [x] T011 [US1] Ensure xterm.js resizes correctly in mobile layout in `frontend/src/components/TerminalView.tsx` — verify the terminal `fit()` addon triggers when MobileLayout mounts and when viewport changes (keyboard open/close). May need to call `terminal.fit()` on `viewportHeight` changes.

**Checkpoint**: On mobile, Claude terminal fills the screen. ~88% content area. Desktop unchanged.

---

## Phase 4: User Story 3 — Mobile Action Bar (Priority: P1)

**Goal**: Bottom action bar with Tab, ↑, ↓, Esc, Enter, Stop, ⇧⇧ buttons for terminal interaction.

**Independent Test**: On mobile, all 7 action buttons visible at bottom. Tap Enter sends input. Tap Stop sends Ctrl+C. Tap ⇧⇧ scrolls to top.

### Tests for User Story 3

- [ ] T012 [P] [US3] Write unit test for MobileActionBar in `frontend/tests/components/MobileActionBar.test.tsx` — verify all 7 buttons render, verify Enter/Stop/ScrollUp callbacks fire correctly

### Implementation for User Story 3

- [x] T013 [US3] Create `MobileActionBar` component in `frontend/src/components/MobileActionBar.tsx` — renders 7 buttons in a horizontal bar: Tab (`\t`), ↑ (`\x1b[A`), ↓ (`\x1b[B`), Esc (`\x1b`), Enter (`\r`, styled blue), Stop (`\x03`, styled red), ⇧⇧ (calls `terminal.scrollToTop()`). Receives terminal ref/write function as prop. Uses existing patterns from `ClaudeActionBar.tsx`.
- [x] T014 [US3] Integrate `MobileActionBar` into `MobileLayout` in `frontend/src/components/MobileLayout.tsx` — render at the bottom of the layout, pass terminal write function and scrollToTop callback

**Checkpoint**: Action bar works on mobile. Users can send messages (Enter), stop Claude (Stop), scroll history (⇧⇧), and use Tab/↑/↓/Esc.

---

## Phase 5: User Story 2 — Tool Approval Cards (Priority: P1)

**Goal**: When Claude needs approval, a prominent card overlay appears with big Accept/Reject buttons.

**Independent Test**: Trigger tool approval in a session. On mobile, card slides up with file name, change preview, and Accept/Reject buttons (≥44px). Tap Accept sends approval.

### Tests for User Story 2

- [ ] T015 [P] [US2] Write unit test for MobileApprovalCard in `frontend/tests/components/MobileApprovalCard.test.tsx` — verify card renders when session is waiting, shows Accept/Reject buttons, verify Accept sends "y" and Reject sends "n" to terminal

### Implementation for User Story 2

- [x] T016 [US2] Create `MobileApprovalCard` component in `frontend/src/components/MobileApprovalCard.tsx` — overlay card that slides up from bottom of terminal content when session state indicates "waiting for input". Shows: warning icon, "Approve?" title, file/command being requested, code preview if available, Accept (green, ≥44px) and Reject (red-outline, ≥44px) buttons. Accept writes "y\r" to terminal, Reject writes "n\r". Reuses session waiting state from existing `WaitingSessionAlert` / `useSession` logic.
- [x] T017 [US2] Integrate approval card into MobileLayout in `frontend/src/components/MobileLayout.tsx` — render `MobileApprovalCard` as an overlay above the terminal content when session is in waiting state. Status dot in `MobileTopBar` turns orange when waiting.

**Checkpoint**: Tool approval works on mobile. Users can approve/reject in 1 tap. Status dot shows waiting state.

---

## Phase 6: User Story 4 — Hamburger Menu (Priority: P2)

**Goal**: Hamburger icon opens full-screen panel navigation. Panels open as full-screen overlays.

**Independent Test**: Tap ☰ → see full-screen menu with Files, Git, Preview, Shell, Settings. Tap Files → file browser fills screen. Tap × → back to terminal.

### Implementation for User Story 4

- [x] T018 [US4] Create `MobileHamburgerMenu` component in `frontend/src/components/MobileHamburgerMenu.tsx` — full-screen overlay listing: Files, Git, Preview, Shell, Settings, New Session. Each item shows icon + label. Tapping an item calls `onSelectPanel(panelName)` and closes the menu. Uses `MobileSheetOverlay` as container.
- [x] T019 [US4] Wire hamburger menu into MobileLayout in `frontend/src/components/MobileLayout.tsx` — when hamburger tapped, open `MobileHamburgerMenu`. When panel selected, open the corresponding panel component inside a `MobileSheetOverlay`. Close overlay returns to terminal. Use `useMobilePanel` hook to manage which overlay is open.
- [x] T020 [P] [US4] Wrap `FileTree`/`FileViewer` for mobile sheet display in `frontend/src/components/MobileLayout.tsx` — when Files is selected from hamburger, render FileTree/FileViewer inside MobileSheetOverlay with a close button
- [x] T021 [P] [US4] Wrap `DiffViewer`/Git panel for mobile sheet display in `frontend/src/components/MobileLayout.tsx` — when Git is selected, render the git/diff view inside MobileSheetOverlay
- [x] T022 [P] [US4] Wrap `ShellTerminal` for mobile sheet display in `frontend/src/components/MobileLayout.tsx` — when Shell is selected, render ShellTerminal inside MobileSheetOverlay

**Checkpoint**: All panels accessible via hamburger menu as full-screen overlays. No tab bar visible on mobile.

---

## Phase 7: User Story 5 — Full-Screen Preview Sheet (Priority: P2)

**Goal**: Preview fills entire viewport with only URL bar + close button.

**Independent Test**: Open Preview on mobile. Iframe fills screen minus ~30px URL bar. Content area ≥90% of viewport.

### Implementation for User Story 5

- [x] T023 [US5] Create `MobilePreviewSheet` component in `frontend/src/components/MobilePreviewSheet.tsx` — full-screen overlay with slim top bar (× close, lock icon, URL text, open-external link). Below: iframe fills remaining space edge-to-edge. Reuses `LivePreview` iframe logic. Top bar ≤35px.
- [x] T024 [US5] Wire Preview into hamburger menu and auto-open in `frontend/src/components/MobileLayout.tsx` — when Preview selected from hamburger, open `MobilePreviewSheet`. Also: when a new localhost port is detected (existing port_change event), show a notification that opens preview on tap.

**Checkpoint**: Preview is truly full-screen on mobile (~95% content). Accessible via hamburger or port notification.

---

## Phase 8: User Story 6 — Session Switching (Priority: P2)

**Goal**: Full-screen session list with rich cards showing status and latest activity.

**Independent Test**: With 3+ sessions, tap session name → full-screen list → tap session → list closes, new session shown.

### Tests for User Story 6

- [ ] T025 [P] [US6] Write unit test for MobileSessionList in `frontend/tests/components/MobileSessionList.test.tsx` — verify session cards render with name, path, status badge; verify tap fires onSelectSession; verify list auto-closes after selection

### Implementation for User Story 6

- [x] T026 [US6] Create `MobileSessionList` component in `frontend/src/components/MobileSessionList.tsx` — full-screen overlay showing all sessions as cards. Each card: session number, status dot, name (bold), project path, status badge ("running"=green, "waiting"=orange, "idle"=gray), one-line latest activity text. Waiting sessions have orange left border. Top bar: × close, "Sessions" title, "+ New" button. Uses `MobileSheetOverlay`.
- [x] T027 [US6] Wire session list into MobileTopBar in `frontend/src/components/MobileLayout.tsx` — tapping session name or badge in MobileTopBar opens MobileSessionList. Selecting a session switches active session and auto-closes the list. Badge in top bar shows count of sessions in "waiting" state.

**Checkpoint**: Session switching works in 2 taps. Rich session cards show status at a glance.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, testing, and final validation

- [ ] T028 Handle on-screen keyboard in `frontend/src/components/MobileLayout.tsx` — when `keyboardOpen` from `useVisualViewport` is true, resize content area to `viewportHeight`, keep action bar above keyboard
- [ ] T029 [P] Test on iPhone SE viewport (375×667) — verify all buttons ≥36px, no horizontal overflow, action bar fully visible
- [ ] T030 [P] Test on Galaxy S25 viewport (360×780) — verify layout works on narrow Android screen
- [ ] T031 Verify desktop layout is unchanged at ≥768px — open app on desktop viewport, confirm no regressions in panel layout, tab bar, session header
- [ ] T032 [P] Handle edge case: multiple queued approval prompts in `frontend/src/components/MobileApprovalCard.tsx` — show one at a time with a "1 of N" indicator
- [ ] T033 Run `npm test && npm run lint` and fix any failures
- [ ] T034 Run quickstart.md validation — follow all test scenarios from quickstart.md on port 3007
- [ ] T035 Push branch, wait for CI green, create PR (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1: Terminal)**: Depends on Phase 2
- **Phase 4 (US3: Action Bar)**: Depends on Phase 2, can parallel with Phase 3
- **Phase 5 (US2: Approval Cards)**: Depends on Phase 3 (needs terminal in MobileLayout)
- **Phase 6 (US4: Hamburger Menu)**: Depends on Phase 2, can parallel with Phases 3-5
- **Phase 7 (US5: Preview Sheet)**: Depends on Phase 6 (hamburger menu opens it)
- **Phase 8 (US6: Session List)**: Depends on Phase 2, can parallel with Phases 3-7
- **Phase 9 (Polish)**: Depends on all phases complete

### User Story Dependencies

- **US1 (Terminal)**: Independent after Phase 2
- **US3 (Action Bar)**: Independent after Phase 2 (parallel with US1)
- **US2 (Approval)**: Needs US1 terminal in place
- **US4 (Hamburger)**: Independent after Phase 2 (parallel with US1)
- **US5 (Preview)**: Needs US4 hamburger menu
- **US6 (Sessions)**: Independent after Phase 2 (parallel with US1)

### Parallel Opportunities

**After Phase 2 completes, these can run in parallel:**
- US1 (Terminal) + US3 (Action Bar) + US4 (Hamburger) + US6 (Sessions)

**Then sequentially:**
- US2 (Approval) after US1
- US5 (Preview) after US4

---

## Parallel Example: After Phase 2

```
Agent 1: T010, T011 (US1 — full-screen terminal)
Agent 2: T013, T014 (US3 — action bar)
Agent 3: T018, T019, T020, T021, T022 (US4 — hamburger menu)
Agent 4: T026, T027 (US6 — session list)
```

---

## Implementation Strategy

### MVP First (Phases 1-4)

1. Complete Phase 1: Setup (breakpoint + hooks + sheet overlay)
2. Complete Phase 2: MobileLayout + MobileTopBar + Dashboard wiring
3. Complete Phase 3: Full-screen Claude terminal (US1) — **this alone is a massive improvement**
4. Complete Phase 4: Action bar (US3) — **now mobile is usable**
5. **STOP and VALIDATE**: Test on iPhone 16 viewport on port 3007

### Full Delivery (Phases 5-9)

6. Phase 5: Approval cards (US2)
7. Phase 6: Hamburger menu (US4)
8. Phase 7: Full-screen preview (US5)
9. Phase 8: Session list (US6)
10. Phase 9: Polish, edge cases, CI

---

## Notes

- **Testing on port 3007**: All changes should be tested against the instance on port 3007 (password: test). Port 3006 is the dev IDE — keep it running.
- **Design reference**: See `specs/033-mobile-chat-monitor/designs/mockup-comparison.html` for the approved Design A mockup.
- **Screenshots**: 14 UX testing screenshots in `specs/033-mobile-chat-monitor/designs/screenshots/` document the current broken state.
- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Commit after each phase completion
- Test on mobile viewport after each checkpoint
