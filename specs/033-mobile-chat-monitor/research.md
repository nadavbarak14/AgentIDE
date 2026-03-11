# Research: Mobile Chat Monitor UX

**Feature**: 033-mobile-chat-monitor
**Date**: 2026-03-11

## R1: Mobile Breakpoint — 640px vs 768px

**Decision**: Use 768px as the mobile/desktop breakpoint.

**Rationale**: The current `useVisualViewport` hook uses 640px (`width < 640`). However, 768px is the standard tablet/phone breakpoint (Tailwind's `md:` breakpoint). Devices between 640-768px (like some Android tablets in portrait) would get the cramped desktop layout at 640px. The spec requires 768px for consistency with standard responsive design practice.

**Alternatives considered**:
- Keep 640px: Too narrow — iPad Mini (744px) and similar tablets would get mobile layout at 640px but desktop at 768px, causing inconsistency.
- Use 1024px: Too wide — small laptops and tablets in landscape would get mobile layout unnecessarily.

**Action**: Change `useVisualViewport.ts` from `width < 640` to `width < 768`.

## R2: Sheet Overlay Animation Pattern

**Decision**: Use CSS `transform: translateY()` with Tailwind transitions for sheet overlays.

**Rationale**: Native-feeling bottom sheets use GPU-accelerated transforms. React state controls visibility (`open/closed`), CSS transitions handle animation. No animation library needed.

**Pattern**:
```
// Sheet slides up from bottom
.sheet-enter: transform: translateY(100%) → translateY(0)
.sheet-exit: transform: translateY(0) → translateY(100%)
// Duration: 300ms ease-out (iOS standard)
```

**Alternatives considered**:
- Framer Motion: Adds ~30KB bundle. Overkill for simple slide transitions.
- React Spring: Similar overhead, unnecessary complexity.
- CSS-only with Tailwind `translate-y-full` + `translate-y-0`: This is the chosen approach — zero new dependencies.

## R3: Terminal Full-Screen on Mobile

**Decision**: On mobile, render `TerminalView` without the parent panel layout. The terminal gets the full content area between top bar and action bar.

**Rationale**: The current `Dashboard.tsx` renders a complex panel system (`usePanel` hook managing splits). On mobile, we bypass this entirely — `MobileLayout` renders `TerminalView` directly in a flex container that fills available space.

**Key finding**: The existing `TerminalView` component already handles xterm.js rendering. It just needs its container to be full-width/height. The `useTerminal` hook handles the terminal instance. No changes to terminal logic needed — only the layout wrapper changes.

## R4: Tool Approval Detection

**Decision**: Parse terminal output for approval prompts and show overlay card on mobile.

**Rationale**: Claude Code outputs approval prompts to the terminal. The existing `WaitingSessionAlert` component already detects when a session is waiting. The mobile approval card reuses this detection and presents it as a prominent overlay instead of an inline terminal message.

**Key finding**: The xterm.js terminal already receives the approval text. The `MobileApprovalCard` will:
1. Listen to the same session state that `WaitingSessionAlert` uses
2. Show as an overlay card when state indicates "waiting for approval"
3. Send "y" or "n" keystrokes to the terminal when Accept/Reject is tapped

## R5: Hamburger Menu — Full-Screen vs Drawer

**Decision**: Full-screen overlay menu (not a side drawer).

**Rationale**: On a 390px phone, a side drawer still takes 75-80% of screen width and leaves a useless sliver. A full-screen menu is cleaner, simpler to implement, and provides larger tap targets. It matches the "everything is full-screen on mobile" pattern.

**Menu items**: Files, Git, Preview, Shell, Settings, New Session
Each opens as its own full-screen sheet overlay.

## R6: Session Status Detection

**Decision**: Reuse existing session state from WebSocket updates. Add a "latest activity" text summary per session.

**Rationale**: The backend already pushes session state changes over WebSocket. The `useSession` and `useSessionQueue` hooks track session status. The mobile session list enriches this with:
- Status badge: "running" (green), "waiting" (orange), "idle" (gray)
- Latest activity line: extracted from the last terminal output line

**No backend changes needed** — all data is already available from existing WebSocket events.

## R7: Desktop Layout Preservation

**Decision**: Guard all mobile layout code behind `isMobile` from `useVisualViewport`. Desktop path remains untouched.

**Rationale**: The spec requires zero desktop regressions. The approach:
1. `Dashboard.tsx` checks `isMobile`
2. If true: render `<MobileLayout />` (new component)
3. If false: render existing desktop layout (unchanged code path)

This is a clean conditional split — the mobile layout is a completely separate component tree. No risk of desktop regression from mobile-specific CSS or layout changes.

## R8: Action Bar Key Mapping

**Decision**: Map action bar buttons to xterm.js key events.

| Button | Terminal Action | xterm.js Input |
|--------|----------------|----------------|
| Tab | Autocomplete | `\t` |
| ↑ | Previous command | `\x1b[A` (escape sequence) |
| ↓ | Next command | `\x1b[B` |
| Esc | Cancel | `\x1b` |
| Enter | Send/submit | `\r` |
| Stop | Ctrl+C | `\x03` |
| ⇧⇧ | Scroll to top | `terminal.scrollToTop()` (xterm API) |

**Key finding**: The existing `ClaudeActionBar.tsx` already implements some of these (Tab, ↑, ↓, Esc, Send). The mobile version adds Stop (Ctrl+C) and Scroll-to-top, and replaces "Send" with "Enter".
