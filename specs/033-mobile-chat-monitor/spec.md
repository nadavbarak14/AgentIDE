# Feature Specification: Mobile Chat Monitor UX

**Feature Branch**: `033-mobile-chat-monitor`
**Created**: 2026-03-11
**Status**: Draft
**Input**: Mobile UX redesign using "Chat Monitor" approach — full-screen Claude terminal as default, approval cards for tool use, full-screen preview sheet, hamburger menu for panel navigation, optimized action bar with Enter/Stop/Scroll keys.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Full-Screen Claude Terminal on Mobile (Priority: P1)

A mobile user opens the app on their phone and immediately sees the Claude conversation terminal taking up the full screen. Only a slim top bar (session name + status + hamburger menu + notification badge) and bottom action bar (Tab, ↑, ↓, Esc, Enter, Stop, ⇧⇧) are visible. No tab bar, no split panels, no preview chrome. The user can read Claude's output, scroll through history, and type messages without any screen real estate wasted on desktop IDE chrome.

**Why this priority**: This is the core experience — 80%+ of mobile usage is reading Claude's output and sending messages. Without this, nothing else matters.

**Independent Test**: Open the app on any phone-width viewport (<768px). The Claude terminal should fill the screen with only the top bar (~35px) and bottom action bar (~45px) visible. Content area should be ~88% of screen height.

**Acceptance Scenarios**:

1. **Given** a user opens the app on a phone (<768px viewport), **When** the page loads with an active session, **Then** the Claude terminal fills the full width and height minus only the top bar and action bar.
2. **Given** a user is viewing the terminal, **When** they tap the text input area and type, **Then** the message input is visible above the on-screen keyboard without the terminal chrome interfering.
3. **Given** a user is viewing the terminal, **When** they tap the Enter button in the action bar, **Then** the typed message is sent to Claude (same as pressing Enter on desktop).
4. **Given** a user is viewing the terminal, **When** they tap the Stop button (red) in the action bar, **Then** Claude's current operation is interrupted (equivalent to Ctrl+C).
5. **Given** a user is viewing the terminal, **When** they tap the ⇧⇧ (scroll up) button, **Then** the terminal scrolls to the top of the conversation history.
6. **Given** a desktop user (≥768px viewport), **When** they view the same page, **Then** the existing desktop layout is shown unchanged.

---

### User Story 2 - Tool Approval Cards (Priority: P1)

When Claude requests permission to perform an action (edit a file, run a command), a prominent approval card slides up from the bottom of the terminal. The card shows what Claude wants to do, a preview of the change, and large Accept/Reject buttons that are easy to tap on a phone. The card is impossible to miss — no scrolling through terminal output to find a buried "type y/n" prompt.

**Why this priority**: Tool approval is the second most common mobile interaction. If users can't quickly approve/reject, Claude stalls and sessions pile up as "waiting."

**Independent Test**: Trigger a tool approval prompt in a session. On mobile, a card overlay appears with Accept/Reject buttons at least 44px tall (iOS minimum tap target). Tapping Accept sends the approval and the card dismisses.

**Acceptance Scenarios**:

1. **Given** Claude requests permission to edit a file on mobile, **When** the approval prompt appears, **Then** an approval card slides up over the terminal showing the file name, a preview of the change, and Accept/Reject buttons.
2. **Given** an approval card is showing, **When** the user taps Accept, **Then** the approval is sent, the card dismisses, and Claude continues.
3. **Given** an approval card is showing, **When** the user taps Reject, **Then** the rejection is sent, the card dismisses, and Claude handles the denial.
4. **Given** the terminal session status dot turns orange/yellow (indicating "waiting"), **When** the user looks at the top bar, **Then** they can see at a glance that action is needed.

---

### User Story 3 - Mobile Action Bar (Priority: P1)

The bottom of the screen shows a persistent action bar with key buttons: Tab (autocomplete), ↑ (previous command), ↓ (next command), Esc (cancel), Enter (send/submit), Stop (Ctrl+C interrupt, red), and ⇧⇧ (scroll to top). These replace the need for a physical keyboard's special keys. The bar is always visible when the terminal is active.

**Why this priority**: Without these keys, mobile users can't interact with Claude Code effectively — they can't send messages, stop operations, or navigate history.

**Independent Test**: On mobile terminal view, verify all 7 buttons are visible and functional. Each button triggers the corresponding terminal action.

**Acceptance Scenarios**:

1. **Given** the Claude terminal is active on mobile, **When** the user looks at the bottom of the screen, **Then** they see the action bar with Tab, ↑, ↓, Esc, Enter, Stop, and ⇧⇧ buttons.
2. **Given** the user has typed text in the input, **When** they tap Enter, **Then** the message is sent to the terminal.
3. **Given** Claude is running a long operation, **When** the user taps the red Stop button, **Then** a Ctrl+C signal is sent to interrupt Claude.
4. **Given** the terminal has scrolled down, **When** the user taps ⇧⇧, **Then** the terminal scrolls to the top of the output.

---

### User Story 4 - Hamburger Menu for Panel Navigation (Priority: P2)

The user taps the hamburger icon (☰) in the top-left corner to open a full-screen panel menu. The menu lists available panels: Files, Git/Diff, Preview, Shell, and a link to Settings. Tapping a panel opens it as a full-screen overlay (sheet) that slides up. Tapping the close button or swiping down returns to the Claude terminal. No split panels ever appear on mobile.

**Why this priority**: Users occasionally need to check files, diffs, or preview but these are secondary to the terminal. The hamburger pattern keeps them accessible without cluttering the primary view.

**Independent Test**: Tap hamburger on mobile, see full-screen menu with panel options. Tap "Files" — the file browser fills the screen. Tap close — back to Claude terminal.

**Acceptance Scenarios**:

1. **Given** a user is on the Claude terminal, **When** they tap the hamburger icon, **Then** a full-screen menu appears listing: Files, Git, Preview, Shell, Settings.
2. **Given** the menu is open, **When** the user taps "Files", **Then** the file browser opens as a full-screen overlay.
3. **Given** a panel overlay is open, **When** the user taps the close button (×), **Then** the overlay closes and the Claude terminal is visible again.
4. **Given** a user is on the Claude terminal, **When** they do not tap the hamburger, **Then** no tab bar, panel labels, or other navigation chrome is visible.

---

### User Story 5 - Full-Screen Preview Sheet (Priority: P2)

When the user opens Preview (via hamburger menu or when Claude opens a preview URL), the preview fills the entire phone screen edge-to-edge. Only a slim top bar with the URL and a close button is visible. The preview content gets ~95% of the screen — compared to the current ~39%.

**Why this priority**: Preview on current mobile is unusable (39% of screen). Full-screen preview is essential for actually reviewing what Claude built.

**Independent Test**: Open Preview on mobile. The iframe content fills the entire screen minus only the URL bar (~30px). Measure: content should be ≥90% of viewport height.

**Acceptance Scenarios**:

1. **Given** a user opens Preview on mobile, **When** the preview loads, **Then** the preview iframe fills the entire viewport with only a slim URL bar (close button + URL + open-external link).
2. **Given** the full-screen preview is showing, **When** the user taps the close button (×), **Then** the preview closes and they return to the Claude terminal.
3. **Given** Claude detects a new localhost port, **When** a preview notification appears, **Then** tapping it opens the preview as a full-screen sheet.

---

### User Story 6 - Session Switching on Mobile (Priority: P2)

The user taps the session name in the top bar (or the notification badge) to open a full-screen session list. Each session card shows: name, project path, status (running/waiting/idle), and a one-line preview of the latest activity. Sessions needing attention (waiting for input) are highlighted. Tapping a session switches to it and the list auto-closes.

**Why this priority**: Multi-session management is a key mobile use case — users kick off multiple Claude tasks and monitor them from their phone.

**Independent Test**: With 3+ sessions active, tap the session name or badge. Full-screen list appears. Tap a different session — the list closes and the new session's terminal is shown.

**Acceptance Scenarios**:

1. **Given** a user has multiple sessions, **When** they tap the session name or badge in the top bar, **Then** a full-screen session list appears showing all sessions with name, path, status, and latest activity.
2. **Given** the session list is open, **When** the user taps a session card, **Then** that session becomes active, the list closes, and the terminal shows that session's output.
3. **Given** sessions are waiting for input, **When** the user views the session list, **Then** those sessions are visually highlighted with a "waiting" badge and orange accent.
4. **Given** the user is on any screen, **When** sessions need attention, **Then** the top bar badge shows the count of sessions waiting.

---

### Edge Cases

- What happens when the on-screen keyboard opens? The action bar should stay above it, and the terminal content should resize.
- What happens on very small screens (iPhone SE, 375×667)? The action bar buttons should still be tappable (minimum 36px height).
- What happens when rotating to landscape? The layout should adapt but keep the same single-panel, full-screen approach.
- What happens if a user resizes a desktop browser below 768px? It should switch to mobile layout. Above 768px, switch back to desktop.
- What happens when multiple approval prompts queue up? Show them one at a time, with a count indicator.
- What happens when the preview has no URL yet? Show a placeholder with instructions, same as current but full-screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect mobile viewport (<768px) and render a completely different layout from desktop.
- **FR-002**: System MUST show the Claude terminal as the full-screen default view on mobile, with only a top bar and action bar visible.
- **FR-003**: System MUST display a slim top bar containing: hamburger menu icon, session status dot, session name, project path (truncated), and notification badge with waiting session count.
- **FR-004**: System MUST display a bottom action bar with buttons: Tab, ↑, ↓, Esc, Enter (blue), Stop (red), ⇧⇧ (scroll up).
- **FR-005**: System MUST NOT show split/side-by-side panels on mobile viewports.
- **FR-006**: System MUST NOT show the desktop tab bar (Files/Git/Claude/Preview/Issues/Shell/Ext/A-/A+) on mobile.
- **FR-007**: System MUST show tool approval prompts as overlay cards with large (≥44px) Accept and Reject buttons.
- **FR-008**: System MUST open all secondary panels (Files, Git, Preview, Shell) as full-screen overlay sheets on mobile.
- **FR-009**: System MUST provide a hamburger menu that opens a full-screen panel/navigation list.
- **FR-010**: System MUST show a full-screen session list when the user taps the session name or badge, with session cards showing name, path, status, and latest activity.
- **FR-011**: System MUST auto-close the session list after the user selects a session.
- **FR-012**: Preview MUST fill the entire viewport on mobile except for a slim URL bar with close button (≤35px).
- **FR-013**: System MUST keep the desktop layout completely unchanged for viewports ≥768px.
- **FR-014**: The Enter button MUST send the current input (no separate "Send" button needed).
- **FR-015**: The Stop button MUST send a Ctrl+C interrupt signal to the active session.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On iPhone 16 (390×844), the Claude terminal content area occupies ≥85% of viewport height.
- **SC-002**: On iPhone 16, the full-screen preview content area occupies ≥90% of viewport height.
- **SC-003**: All action bar buttons and approval card buttons meet the minimum 44px tap target size.
- **SC-004**: Users can approve a tool call in 1 tap (no typing "y" or scrolling to find the prompt).
- **SC-005**: Session switching completes in 2 taps (tap badge → tap session).
- **SC-006**: The desktop layout renders identically to the current version on viewports ≥768px (no regressions).
- **SC-007**: On iPhone SE (375×667), all UI elements remain usable without horizontal scrolling or overlapping.
- **SC-008**: Chrome overhead (non-content pixels) on mobile is ≤15% of viewport height in the default Claude terminal view.
