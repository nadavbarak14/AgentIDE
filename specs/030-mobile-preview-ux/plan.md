# Implementation Plan: Mobile Preview UX Redesign

**Branch**: `030-mobile-preview-ux` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-mobile-preview-ux/spec.md`

## Summary

Remove all mobile-specific UI code paths (MobileSessionView, MobileTerminalOutput, isMobileViewport branch in SessionCard) and unify mobile and desktop into a single responsive SessionCard. On small viewports, show exactly one session filling the full viewport with a minimal control strip, compact session selector with waiting-session alerts, keyboard-aware layout using `visualViewport` API, and edge-to-edge preview rendering. No new backend changes, no schema changes — purely frontend refactoring and enhancement.

## Technical Context

**Language/Version**: TypeScript 5.7
**Primary Dependencies**: React 18, Tailwind CSS 3, Vite 6, xterm.js 5, @monaco-editor/react 4.6
**Storage**: N/A — no database changes
**Testing**: Vitest 2.1.0, @testing-library/react, @testing-library/jest-dom
**Target Platform**: Web (desktop + mobile browsers, iOS Safari, Chrome Android)
**Project Type**: Web application (frontend only for this feature)
**Performance Goals**: 60fps layout transitions, <100ms keyboard open/close adaptation
**Constraints**: Zero page-level scroll on mobile, terminal input always visible above keyboard, all controls accessible via touch
**Scale/Scope**: ~8 files modified, ~2 files deleted, ~2 new files (hook + component)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for new hook (useVisualViewport), component tests for session selector, integration test for mobile layout |
| II. UX-First Design | PASS | Core feature IS UX redesign — spec has 6 user stories with acceptance scenarios |
| III. UI Quality & Consistency | PASS | Unifying mobile/desktop into one code path improves consistency |
| IV. Simplicity | PASS | Removing mobile-specific components reduces code; one render path is simpler than two |
| V. CI/CD Pipeline | PASS | No special CI changes needed |
| VI. Frontend Plugin Quality | PASS | No new dependencies — uses built-in `visualViewport` API |
| VII. Backend Security | N/A | No backend changes |
| VIII. Observability | N/A | Frontend-only change |

No violations. No complexity tracking needed.

## Project Structure

### Documentation (this feature)

```text
specs/030-mobile-preview-ux/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── SessionCard.tsx            # MODIFY: remove isMobileViewport branch, add action bar
│   │   ├── SessionGrid.tsx            # MODIFY: single-session mode on narrow viewports
│   │   ├── LivePreview.tsx            # MODIFY: force desktop viewport mode on mobile
│   │   ├── MobileSessionView.tsx      # DELETE
│   │   ├── MobileTerminalOutput.tsx   # DELETE
│   │   ├── MobileSessionSelector.tsx  # NEW: compact session switcher for mobile
│   │   ├── ClaudeActionBar.tsx        # NEW: contextual quick-action bar for Claude Code
│   │   ├── WaitingSessionAlert.tsx    # NEW: floating alert for waiting sessions
│   │   └── ScrollToBottomButton.tsx   # NEW: floating button when terminal scrolled up
│   ├── hooks/
│   │   ├── useVisualViewport.ts       # NEW: keyboard detection + viewport tracking
│   │   └── useClaudeMode.ts           # NEW: detect Claude Code mode from output patterns
│   └── pages/
│       └── Dashboard.tsx              # MODIFY: remove headline, add mobile control strip
└── tests/
    └── (corresponding test files)
```

**Structure Decision**: Web application structure (frontend/ + backend/). This feature modifies only frontend/. No new backend code. No data model changes. No API contract changes.

## Phase 0: Research Findings

See [research.md](./research.md) for full details.

### Key Decisions

1. **Keyboard detection**: Use `window.visualViewport` resize events — no new dependencies, supported on all target browsers (iOS Safari 13+, Chrome Android 62+)
2. **Single-session mobile layout**: Dashboard detects narrow viewport and passes `maxVisible=1` to SessionGrid — minimal change, reuses existing frozen-display model
3. **Session selector**: New lightweight component (not reusing SessionSwitcher which is keyboard-chord-based) — a tap-triggered dropdown overlay
4. **Waiting session alert**: Floating pill at bottom of viewport, always above keyboard, single-tap to switch — uses existing `needsInput` state from sessions
5. **Preview on mobile**: Force `viewportMode='desktop'` when on mobile device — no device bezel since the phone IS the device
6. **Chrome auto-hide**: Use `useVisualViewport` hook to detect keyboard open, set CSS class that collapses toolbar and header to icon-only mode

## Phase 1: Design

### No Data Model Changes

This feature is purely frontend. No database tables, columns, or migrations needed.

### No API Contract Changes

No new endpoints. No changes to existing endpoints. The feature consumes existing session data (including `needsInput` state) which is already available via the existing polling/WebSocket mechanism.

### Component Design

#### 1. `useVisualViewport` Hook

```typescript
interface UseVisualViewportReturn {
  /** True when on-screen keyboard is likely open (viewport height significantly reduced) */
  keyboardOpen: boolean;
  /** Current visual viewport height in px */
  viewportHeight: number;
  /** True when viewport width < 640px */
  isMobile: boolean;
}
```

- Listens to `window.visualViewport.resize` event
- Compares `visualViewport.height` to `window.innerHeight` — if difference > 150px, keyboard is open
- Provides `isMobile` flag based on viewport width (replaces scattered `matchMedia` calls)
- Debounced to avoid thrashing during keyboard animation

#### 2. `MobileSessionSelector` Component

```typescript
interface MobileSessionSelectorProps {
  sessions: Session[];
  currentSessionId: string | null;
  waitingCount: number;
  onSelect: (id: string) => void;
  onNewSession: () => void;
}
```

- Renders as a compact strip: `[current session title ▾] [+ New] [⚡ 2 waiting]`
- Tap title → dropdown overlay with all sessions (title, status dot, needs-input indicator)
- Tap waiting badge → jump to first waiting session
- Auto-hides when keyboard is open (or collapses to just the waiting badge)

#### 3. `ClaudeActionBar` Component (the core mobile interaction layer)

```typescript
type ClaudeMode = 'permission' | 'generating' | 'input' | 'idle';

interface ClaudeActionBarProps {
  /** Current detected mode based on terminal output + needsInput state */
  mode: ClaudeMode;
  /** Send raw data to the terminal PTY */
  onSend: (data: string) => void;
  /** Keyboard offset from visualViewport (0 when keyboard closed) */
  keyboardOffset: number;
  /** Whether terminal is scrolled away from bottom */
  isScrolledUp: boolean;
  /** Scroll terminal to bottom */
  onScrollToBottom: () => void;
}
```

**Mode detection logic** (in a `useClaudeMode` hook):
- `permission`: `needsInput === true` AND last terminal output matches `/\(y\/n\)|Allow|Deny|approve|reject/i`
- `generating`: `needsInput === false` AND `status === 'active'`
- `input`: `needsInput === true` AND not a permission prompt
- `idle`: `status === 'completed'` OR `status === 'failed'`

**Rendered action bar by mode:**

| Mode | Left buttons | Right buttons |
|------|-------------|---------------|
| `permission` | **Accept** (green, large) / **Reject** (red, large) | Esc |
| `generating` | **Stop** (red, large) | (scroll-to-bottom if scrolled up) |
| `input` | Tab / ↑ / ↓ / Esc | **Send** (blue) |
| `idle` | **Continue** | — |

**Key sends:**
- Accept → `"y\n"` (0x79 0x0A)
- Reject → `"n\n"` (0x6E 0x0A)
- Stop → `"\x03"` (Ctrl+C)
- Tab → `"\t"` (0x09)
- Arrow Up → `"\x1b[A"` (ESC [ A)
- Arrow Down → `"\x1b[B"` (ESC [ B)
- Escape → `"\x1b"` (0x1B)
- Continue → `"\n"` (Enter)

**Positioning:**
- `position: fixed`, `bottom` = keyboard offset from `useVisualViewport`
- Full width, ~44px height, translucent dark background
- Sits between terminal content and keyboard
- Hidden on desktop (only rendered when `isMobile`)

#### 4. `WaitingSessionAlert` Component

```typescript
interface WaitingSessionAlertProps {
  waitingSessions: Session[];
  onSwitch: (id: string) => void;
}
```

- Floating pill positioned above the action bar (or at bottom when no action bar)
- Pulsing amber indicator: "Session X needs input" or "2 sessions waiting"
- Single tap → switch to first waiting session
- Uses `position: fixed` + `bottom` calculated from `visualViewport` + action bar height
- Rendered at Dashboard level (outside SessionCard) so it's always visible

#### 5. `useClaudeMode` Hook

```typescript
interface UseClaudeModeReturn {
  mode: ClaudeMode;
  /** Whether the terminal is scrolled up from the bottom */
  isScrolledUp: boolean;
}
```

- Combines `session.needsInput`, `session.status`, and terminal output pattern matching
- Watches terminal output buffer (last N lines) for permission prompt patterns
- Updates on each terminal write and session status change
- Provides `isScrolledUp` from xterm.js viewport state

#### 6. `ScrollToBottomButton` Component

- Floating button that appears when terminal is scrolled up
- Shows "↓" with optional new-line count badge
- Tapping scrolls xterm.js to bottom
- Positioned just above the action bar

#### 7. Dashboard Changes

- Remove "Adyx" headline `<h1>` and associated mobile breakpoint conditionals
- On mobile (`isMobile` from hook): render `MobileSessionSelector` instead of top bar
- Pass `maxVisible={1}` to session display logic when mobile
- Render `WaitingSessionAlert` at root level

#### 8. SessionCard Changes

- Delete entire `if (isMobileViewport) { ... }` block (~70 lines)
- Delete `mobileTab` state and `isMobileViewport` state
- When `keyboardOpen` (from context/prop): collapse header to single line (title only), hide toolbar text labels (icon-only or hide entirely)
- Render `ClaudeActionBar` inside the session card when `isMobile`, passing `onSend` that writes to the terminal PTY via the existing `sendInput` WebSocket function
- Expose terminal scroll state for `ScrollToBottomButton`

#### 9. LivePreview Changes

- When `isMobile`: default to `viewportMode='desktop'` (no device bezel)
- Ensure iframe gets `width: 100%; height: 100%` in the panel (already does in desktop mode)
- Touch events already pass through to iframe — no changes needed

#### 10. Terminal Touch Improvements

- xterm.js already supports touch scrolling via its built-in viewport
- Add `terminal.options.scrollSensitivity = 3` for smoother momentum feel on touch
- Expose `terminal.buffer.active.viewportY` to detect scroll position for "scrolled up" state
- Ensure `ClipboardAddon` handles long-press text selection on mobile (already loaded)

#### 11. File Deletions

- `frontend/src/components/MobileSessionView.tsx` — dead code after SessionCard unification
- `frontend/src/components/MobileTerminalOutput.tsx` — dead code, no longer imported
