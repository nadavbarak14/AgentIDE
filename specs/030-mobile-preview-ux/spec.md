# Feature Specification: Mobile Preview UX Redesign

**Feature Branch**: `030-mobile-preview-ux`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "Revert mobile-specific views. Use the existing preview panel as the mobile experience — regular box layout, full-screen, no scroll, no headlines, one session view at a time with session selection and full preview/control capabilities."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View session on mobile with full desktop controls (Priority: P1)

A user opens the Adyx dashboard on their phone. Instead of seeing a mobile-specific bottom-tab-bar layout with stripped-down terminal output, they see the same desktop-style session card rendered inside a single full-screen view. The session card includes the standard toolbar with all panel controls (files, git, preview, shell) — identical to desktop. One session fills the entire viewport with no page-level scroll and no wasted headline space.

**Why this priority**: This is the core experience — without it, mobile users have a degraded, separate UX that diverges from desktop. The whole point is to unify mobile and desktop into one component.

**Independent Test**: Open the app at 375px viewport width with one active session. Confirm the session card fills the screen, the standard toolbar is visible, panels (preview, files, git) can be toggled, and no mobile-specific bottom tab bar or "Adyx" headline appears.

**Acceptance Scenarios**:

1. **Given** a user opens the app on a mobile viewport with one active session, **When** the page loads, **Then** that session's desktop-style card fills the viewport — no "Adyx" headline, no mobile bottom tab bar, no page scroll
2. **Given** a user is viewing a session on mobile, **When** they tap the preview toolbar button, **Then** the LivePreview panel opens with the same address bar, viewport controls, device presets, and reload button as desktop
3. **Given** a user is viewing a session on mobile, **When** they tap the files or git toolbar button, **Then** the panel opens within the session card using the same split-panel layout as desktop

---

### User Story 2 - Switch between sessions on mobile (Priority: P1)

A user has multiple active sessions running. Since only one session is shown at a time on mobile, they need a compact way to pick a different session. The session selector should be quick (1-2 taps) and show session status (active, needs input, title).

**Why this priority**: Equally critical — without session switching, users are locked to one session on mobile, making the app unusable for multi-session workflows.

**Independent Test**: Create two sessions, open on a mobile viewport. Confirm a session selector is accessible, tapping a different session swaps the view, and the new session fills the viewport.

**Acceptance Scenarios**:

1. **Given** a user has 2+ active sessions on mobile, **When** they tap the session selector, **Then** a compact list of sessions appears showing title, status, and needs-input indicators
2. **Given** a user taps a different session in the selector, **When** the switch completes, **Then** the selected session fills the full viewport and the selector dismisses
3. **Given** a user has only one active session, **When** they view the app, **Then** the session selector is hidden or minimal since there's nothing to switch to

---

### User Story 3 - Work comfortably with on-screen keyboard open (Priority: P1)

A user is typing prompts into the terminal on their phone. When the on-screen keyboard opens, it consumes roughly half the viewport. The UI must adapt gracefully — the terminal input stays visible and anchored above the keyboard, the toolbar and any chrome auto-hide or collapse to maximize the visible terminal area, and nothing scrolls off-screen or gets covered.

**Why this priority**: On mobile, users spend most of their time typing into the terminal. If the keyboard covers the input or wastes space on chrome, the experience is unusable. This is as critical as the core layout.

**Independent Test**: On a mobile viewport, tap into the terminal input. Confirm the keyboard pushes the terminal input up (stays visible), the toolbar/chrome collapses or hides, and the visible terminal area is maximized above the keyboard.

**Acceptance Scenarios**:

1. **Given** a user taps the terminal input on mobile, **When** the on-screen keyboard opens, **Then** the terminal input remains visible above the keyboard — never covered or scrolled away
2. **Given** the keyboard is open, **When** the user looks at the screen, **Then** any non-essential chrome (toolbar, session selector, headers) is auto-hidden or collapsed to maximize terminal content area
3. **Given** the keyboard is open and the user dismisses it, **When** the keyboard closes, **Then** the full UI chrome restores and the session card fills the viewport again

---

### User Story 4 - See alerts for waiting sessions (Priority: P1)

A user is viewing one session but another session is waiting for input. A visible, persistent alert must appear — even when the keyboard is open — so the user knows another session needs attention. The alert should identify which session(s) are waiting and allow quick switching with a single tap.

**Why this priority**: Without this, users miss input prompts on background sessions, causing sessions to stall indefinitely. This is critical for multi-session workflows on mobile.

**Independent Test**: Run two sessions, one needing input. Confirm a visible badge/alert appears on the session selector or as a floating indicator, and tapping it switches to the waiting session.

**Acceptance Scenarios**:

1. **Given** a user is viewing session A and session B needs input, **When** session B enters waiting state, **Then** a visible indicator appears (e.g., pulsing badge on the session selector, or a floating alert) showing that a session needs attention
2. **Given** the waiting-session alert is visible, **When** the user taps it, **Then** the app switches to the waiting session immediately (single tap)
3. **Given** multiple sessions are waiting, **When** the user sees the alert, **Then** it indicates the count of waiting sessions (e.g., "2 waiting")
4. **Given** the keyboard is open, **When** a session starts waiting, **Then** the alert is still visible — not hidden behind the keyboard or collapsed chrome

---

### User Story 5 - Create a new session on mobile (Priority: P2)

A user wants to start a new session from their phone. They need access to the session creation form (title, project directory, worker, flags) via an overlay or slide-in panel that doesn't permanently consume screen space.

**Why this priority**: Important but secondary — users can create sessions on desktop and interact on mobile. Still needed for a self-contained mobile workflow.

**Independent Test**: On a mobile viewport, trigger the new session form, fill it out, submit, and confirm the new session is auto-selected and shown.

**Acceptance Scenarios**:

1. **Given** a user is on mobile, **When** they tap the "new session" button, **Then** the SessionQueue form appears as an overlay with all fields accessible via touch
2. **Given** a user submits the creation form, **When** the session is created, **Then** the overlay dismisses and the new session fills the viewport

---

### User Story 6 - Claude Code action bar with contextual quick actions (Priority: P1)

A user is interacting with Claude Code on their phone. Instead of a generic SSH key toolbar, the app shows a **contextual action bar** that adapts to what Claude Code is currently doing. This bar sits between the terminal and the keyboard (or at the bottom when keyboard is closed) and shows only the actions relevant to the current mode.

**Modes and actions:**
- **Permission prompt** (Claude asks y/n): Show large **Accept** and **Reject** buttons — one tap, no typing needed
- **Generating** (Claude is working): Show a prominent **Stop** button (sends Ctrl+C)
- **Waiting for prompt** (Claude needs user input): Show **Tab** (autocomplete), **↑↓** (history), **Esc** keys, plus a **Send** button
- **Idle/complete**: Show a **Continue** button or a prompt to start typing

The action bar also always provides a **Tab** key (for autocomplete), **Esc**, and **Ctrl+C** since phones don't have these keys.

**Why this priority**: Claude Code's primary interaction loop on mobile is: type prompt → watch output → answer permission → repeat. Without one-tap Accept/Reject and a Stop button, the experience is frustrating — users fumble to type "y" + Enter on a phone keyboard. This is what makes mobile Claude Code actually usable.

**Independent Test**: Start a Claude Code session on mobile, give it a task that triggers a permission prompt. Confirm the Accept/Reject buttons appear, tapping Accept sends "y\n", tapping Reject sends "n\n". Then confirm Stop sends Ctrl+C during generation.

**Acceptance Scenarios**:

1. **Given** Claude Code is showing a permission prompt (y/n), **When** the action bar renders, **Then** it shows prominent Accept and Reject buttons — tapping Accept sends "y\n" to the terminal, tapping Reject sends "n\n"
2. **Given** Claude Code is generating output, **When** the action bar renders, **Then** it shows a Stop button — tapping it sends Ctrl+C (character code 0x03) to the terminal
3. **Given** Claude Code is waiting for a text prompt, **When** the action bar renders, **Then** it shows Tab, ↑, ↓, Esc keys that send the correct escape sequences to xterm.js
4. **Given** the user taps the Tab key in the action bar, **When** Claude Code is waiting for input, **Then** a Tab character (0x09) is sent to the terminal triggering autocomplete
5. **Given** the action bar is visible, **When** the keyboard opens or closes, **Then** the action bar repositions to stay just above the keyboard (or at the bottom of the viewport)

---

### User Story 7 - Easy terminal scrolling and copy on mobile (Priority: P2)

A user needs to scroll back through Claude's output to review code it wrote or read error messages. Touch scrolling in the xterm.js terminal must feel smooth and natural. When scrolled up, a floating "scroll to bottom" button appears. Users can also long-press to select text and copy it.

**Why this priority**: Reading and reviewing Claude's output is half the workflow. If scrolling is janky or you can't copy a code snippet Claude wrote, the mobile experience falls short.

**Independent Test**: Run a session that produces long output. Scroll up via touch, confirm smooth momentum scrolling. Confirm a "jump to bottom" button appears. Long-press to select text, confirm copy works.

**Acceptance Scenarios**:

1. **Given** the terminal has more output than fits on screen, **When** the user swipes up on the terminal, **Then** it scrolls smoothly with momentum (touch-native feel)
2. **Given** the user has scrolled up in the terminal, **When** new output arrives, **Then** a floating "↓ Jump to bottom" button appears — tapping it scrolls to the latest output
3. **Given** the user wants to copy terminal text, **When** they long-press on the terminal, **Then** text selection activates and they can copy via the system clipboard

---

### User Story 8 - Preview mimics a real device experience (Priority: P1)

When viewing the preview panel on mobile, the preview should feel like a native app preview — the iframe fills the available space naturally since the user's phone IS the target device. No device chrome/bezel simulation needed (the user is already on a phone). The preview should be touch-interactive, responsive, and feel like opening the app directly — not like looking at a small window inside a window.

**Why this priority**: The whole point of mobile access is to see and interact with the preview as it would appear on a real device. If the preview is cramped or wrapped in unnecessary chrome, it defeats the purpose.

**Independent Test**: Open the preview panel on a mobile viewport. Confirm the preview iframe fills the available panel space edge-to-edge, is touch-scrollable/interactive, and has no unnecessary device bezel or extra padding.

**Acceptance Scenarios**:

1. **Given** a user opens the preview panel on mobile, **When** the preview loads, **Then** the iframe fills the full available width and height of the panel — no device bezel wrapper, no excess margins
2. **Given** a user interacts with the preview on mobile, **When** they tap, scroll, or swipe within the preview, **Then** touch events pass through naturally to the iframe content
3. **Given** the preview is showing on mobile, **When** the address bar and controls are visible, **Then** they are compact and touch-friendly, leaving maximum space for the preview content itself

---

### Edge Cases

- What happens at intermediate widths (e.g., 768px tablet portrait)? The layout should still be functional — either one-session or multi-session grid, with no scroll and no broken panels.
- What happens when all sessions are completed/failed? Show the empty state with an invitation to create a session.
- What happens when the user rotates their device mid-session? The session card and panels should reflow to the new dimensions without requiring a reload.
- What happens if the session card's panels (files + terminal + preview) are all open on a very narrow screen? Panels should stack or one should take priority, never overflowing the viewport.
- What happens when the keyboard opens while the preview panel is active (not terminal)? The preview should shrink to fit above the keyboard, not get covered.
- What happens if a session starts waiting for input while the user is typing in another session with keyboard open? The alert must be visible even with reduced screen real estate.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST NOT render any mobile-specific layout — no bottom tab bar, no MobileSessionView, no MobileTerminalOutput — all viewports use the same SessionCard component
- **FR-002**: On small viewports, the app MUST display exactly one session at a time, filling the full viewport height and width with no page-level scroll
- **FR-003**: The "Adyx" headline and any branding text in the top bar MUST be removed or replaced with a minimal, space-efficient element (e.g., just a session indicator or nothing)
- **FR-004**: Users MUST be able to switch between active sessions via a compact selector accessible in 1-2 taps
- **FR-005**: The session card on mobile MUST include the same toolbar, panel controls (files, git, preview, shell, search), and preview capabilities as the desktop session card
- **FR-006**: The sidebar (SessionQueue / new session form) MUST be accessible on mobile as an overlay but MUST NOT consume permanent viewport space
- **FR-007**: The viewport MUST be fully utilized — no dead space, no excess padding, no visible chrome beyond the session card and a minimal control strip
- **FR-008**: The MobileSessionView.tsx and MobileTerminalOutput.tsx components MUST be deleted as they are superseded
- **FR-009**: The `isMobileViewport` conditional branch in SessionCard.tsx MUST be removed — the desktop render path handles all viewport sizes
- **FR-010**: When the on-screen keyboard is open, the UI MUST adapt — terminal input stays visible above the keyboard, non-essential chrome auto-hides to maximize content area
- **FR-011**: When any background session enters "needs input" state, a persistent visible alert MUST appear — even when the keyboard is open — showing which/how many sessions are waiting, tappable to switch in one tap
- **FR-012**: The preview panel on mobile MUST render the iframe edge-to-edge within the panel (no device bezel simulation) since the user's actual device IS the target — touch events MUST pass through to iframe content naturally
- **FR-013**: All UI elements (toolbar buttons, session selector, alerts) MUST be minimalist and auto-hide when not needed — the design philosophy is "hidden until needed, smart about when to show"
- **FR-014**: On mobile, a contextual action bar MUST appear between the terminal and keyboard, showing actions based on Claude Code's current mode: Accept/Reject for permission prompts, Stop for generation, Tab/↑/↓/Esc for input mode
- **FR-015**: The Accept button MUST send "y\n" and the Reject button MUST send "n\n" to the terminal PTY — these are the most frequent micro-interactions and MUST be one-tap
- **FR-016**: The Stop button MUST send Ctrl+C (0x03) to the terminal PTY to interrupt Claude Code generation
- **FR-017**: The action bar MUST provide Tab (0x09), Arrow Up (ESC[A), Arrow Down (ESC[B), and Escape (0x1B) keys since phone keyboards lack these
- **FR-018**: The action bar MUST detect the current Claude Code mode by analyzing terminal output patterns (permission prompt regex, generating state, idle state) combined with the session's `needsInput` flag
- **FR-019**: Terminal scrolling on touch devices MUST feel smooth with momentum; when scrolled up from bottom, a floating "jump to bottom" button MUST appear
- **FR-020**: The action bar MUST reposition to stay above the on-screen keyboard when it opens, and at the bottom of the viewport when keyboard is closed

### Key Entities

- **Session Card**: The single unified component rendering a session — identical on mobile and desktop, with panels controlled by the same toolbar
- **Session Selector**: A compact overlay or dropdown for switching sessions on small viewports (replaces the sidebar session list for navigation)
- **Top Control Strip**: A minimal strip replacing the current headline bar — just enough for session selection, new-session button, and settings access
- **Claude Action Bar**: A contextual toolbar for mobile that adapts to Claude Code's current mode — shows Accept/Reject during permission prompts, Stop during generation, special keys during input

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users on mobile viewports can access all session features (terminal, preview, files, git, shell) — zero features are hidden or degraded compared to desktop
- **SC-002**: The app renders with zero page-level scroll on mobile viewports — everything fits within the visible area
- **SC-003**: Switching between sessions on mobile takes at most 2 taps
- **SC-004**: The SessionCard component has zero conditional mobile rendering branches — one code path for all viewports
- **SC-005**: Screen space utilization on mobile is 95%+ with the session card occupying nearly the full viewport
- **SC-006**: When the on-screen keyboard is open, the terminal input is always visible and at least 30% of the terminal content area remains readable above the keyboard
- **SC-007**: Users are notified of waiting background sessions within 2 seconds of the session entering waiting state, and can switch to it in 1 tap
- **SC-008**: Preview iframe on mobile fills 95%+ of the available panel width with no device bezel wrappers
- **SC-009**: Permission prompts can be answered in 1 tap via the Accept/Reject buttons (vs 3+ taps to type "y" + Enter on a phone keyboard)
- **SC-010**: Claude Code generation can be stopped in 1 tap via the Stop button
- **SC-011**: Tab autocomplete is accessible via 1 tap on the action bar (not possible on standard phone keyboards)
- **SC-012**: Terminal scroll-to-bottom button appears within 200ms of scrolling away from the bottom

## Assumptions

- "Mobile" means viewport width below ~640px (current `sm:` Tailwind breakpoint), but the design should be fluid — no hard breakpoint causing layout jumps
- The existing LivePreview component already renders well on small screens — no changes needed to the preview iframe logic
- Keyboard shortcuts are not expected to work on touch devices — touch interaction is primary
- The session card's panel resize drag handles may need slightly larger touch targets but the same drag behavior applies
- The existing SessionSwitcher overlay (Ctrl+. Tab) can be repurposed or adapted as the mobile session selector
- The `visualViewport` API is available on modern mobile browsers for detecting keyboard open/close and remaining viewport height
- On mobile, when the preview panel is open, "desktop" viewport mode should be the default (no device bezel) since the user is already on a phone — the device IS the preview target
