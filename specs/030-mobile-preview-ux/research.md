# Research: Mobile Preview UX Redesign

## R1: On-Screen Keyboard Detection

**Decision**: Use `window.visualViewport` API with resize event listener

**Rationale**: The `visualViewport` API is the standard way to detect keyboard open/close on mobile browsers. When the keyboard opens, `visualViewport.height` shrinks while `window.innerHeight` stays the same (on most browsers). Comparing the two gives a reliable keyboard-open signal.

**Implementation pattern**:
```typescript
const vv = window.visualViewport;
if (!vv) return; // fallback: no detection, layout stays static

vv.addEventListener('resize', () => {
  const keyboardOpen = window.innerHeight - vv.height > 150;
  // update state
});
```

**Browser support**: iOS Safari 13+ (2019), Chrome Android 62+ (2017), Firefox Android 68+. Covers all realistic mobile targets.

**Alternatives considered**:
- `window.resize` event: Unreliable — fires for many reasons, can't distinguish keyboard from rotation
- `focusin`/`focusout` on inputs: Race conditions, doesn't detect keyboard close from back button
- CSS `100dvh`: Only sizes elements, doesn't provide a JS signal for auto-hiding chrome

**Threshold**: 150px difference chosen because keyboards are typically 250-350px tall. A 150px threshold avoids false positives from browser chrome (address bar) showing/hiding (~50-80px).

---

## R2: Single-Session Mobile Layout Strategy

**Decision**: Dashboard passes `maxVisible=1` when `isMobile`, SessionGrid renders one full-height card

**Rationale**: The existing frozen-display model in Dashboard already supports variable `maxVisible` (configured via settings). Setting it to 1 on mobile viewports is the minimal change that achieves full-screen single-session layout. No new layout system needed.

**Existing mechanism** (Dashboard.tsx):
- `maxVisible` is read from `appSettings?.maxVisibleSessions ?? 4`
- It controls `displayedIds` array length
- SessionGrid renders a CSS grid with `gridTemplateColumns: repeat(N, 1fr)`
- When N=1, the single card naturally fills the full width and height

**Changes needed**:
- Dashboard: override `maxVisible` to 1 when `isMobile`
- SessionGrid: when single card, use `h-full` instead of `auto-rows-fr` grid to fill viewport
- No changes to the frozen-display logic, FIFO queue, or swap mechanism

**Alternatives considered**:
- Separate mobile page/route: Rejected — creates divergent codepaths, violates spec FR-001
- CSS media query only: Insufficient — need JS to control session count and selector behavior

---

## R3: Session Selector UI Pattern

**Decision**: New `MobileSessionSelector` component — compact strip with tap-to-expand dropdown

**Rationale**: The existing `SessionSwitcher` component is designed for keyboard chord navigation (Ctrl+Tab) with arrow key cycling. It doesn't work for touch interaction. A new lightweight component is simpler than adapting the keyboard-focused one.

**Design**:
- Renders inline at the top of the mobile layout (replaces the headline bar)
- Compact: current session name + dropdown arrow + waiting count badge
- Tap → overlay dropdown listing all sessions with status indicators
- Tap a session → `onFocusSession(id)` + dismiss dropdown
- Total height: ~36px when collapsed, overlay when expanded

**Alternatives considered**:
- Reuse SessionSwitcher: Too coupled to chord state, would need significant refactoring
- Bottom sheet / swipe gesture: More complex, harder to implement reliably across browsers
- Sidebar (existing SessionQueue): Already exists as overlay, but too heavy for just switching — includes full creation form

---

## R4: Waiting Session Alert Positioning

**Decision**: Floating pill at bottom of visual viewport, repositioned on keyboard open

**Rationale**: The alert must be visible at all times — even when keyboard is open. Using `position: fixed` with `bottom` calculated from `visualViewport.offsetTop + visualViewport.height` ensures it sits just above the keyboard.

**Implementation pattern**:
```typescript
// Position alert above keyboard
const bottom = window.innerHeight - (vv.offsetTop + vv.height) + 8; // 8px padding
style={{ position: 'fixed', bottom: `${bottom}px` }}
```

**Alternatives considered**:
- CSS `position: sticky` at bottom: Gets pushed off-screen by keyboard
- Inside SessionCard: Hidden when keyboard collapses chrome
- Browser notification API: Requires permission, overkill for in-app alerts

---

## R5: Preview Viewport Mode on Mobile

**Decision**: Force `viewportMode='desktop'` when on mobile, skip device bezel rendering

**Rationale**: When a user opens the preview on their phone, they ARE the target device. Wrapping the iframe in a phone bezel simulation is redundant and wastes screen space. Desktop mode renders the iframe at `width: 100%; height: 100%` which fills the panel edge-to-edge — exactly what we want.

**Changes**: In SessionCard's panel state initialization or LivePreview props, when `isMobile` is true, override `viewportMode` to `'desktop'` regardless of saved state.

**Alternatives considered**:
- Hide viewport toggle entirely on mobile: Too aggressive — user might want to simulate a tablet
- Default to mobile viewport: Renders phone bezel on a phone, wasting space

---

## R6: Toolbar Behavior When Keyboard Opens

**Decision**: Auto-collapse toolbar to hidden when keyboard is open; restore on close

**Rationale**: The toolbar is ~24px tall (text labels, padding) and uses `flex-wrap` which can make it 2+ lines on narrow screens. When the keyboard eats ~50% of the viewport, that 24-48px is significant. Hiding it entirely when the keyboard is open maximizes terminal content area. Users don't need panel toggle buttons while typing.

**Mechanism**: `useVisualViewport` hook provides `keyboardOpen` boolean → SessionCard hides toolbar div when true. The header (session title + status) collapses to a minimal single line or hides entirely.

**Alternatives considered**:
- Collapse to icons only: Still takes ~20px, and icons aren't established in the current design
- Keep toolbar visible: Wastes 5-10% of already-cramped space
- Swipe-to-reveal: Complex gesture handling, unreliable

---

## R7: Existing Mobile Code to Remove

**Files to delete**:
- `frontend/src/components/MobileSessionView.tsx` (220 lines) — full-screen tab-bar mobile layout, never used after SessionCard unification
- `frontend/src/components/MobileTerminalOutput.tsx` (37 lines) — ANSI-stripping read-only terminal output, replaced by real xterm.js

**Code blocks to remove in existing files**:
- `SessionCard.tsx` lines 130-132: `mobileTab` state
- `SessionCard.tsx` lines 131-133: `isMobileViewport` state + matchMedia listener
- `SessionCard.tsx` lines 984-1050: entire `if (isMobileViewport) { ... }` mobile render block
- `Dashboard.tsx` lines 788-797: "Adyx" headline and mobile-specific breakpoint text
- `Dashboard.tsx` lines 820-835: mobile session count badge
- `SessionQueue.tsx` lines 51-60: `isMobile` state and matchMedia listener
- `SessionQueue.tsx` lines 134-140: mobile-only "Advanced options..." collapsed section

**Imports to clean up**:
- Remove `MobileSessionView` import from any file
- Remove `MobileTerminalOutput` import from `MobileSessionView.tsx` (deleted anyway)

---

## R8: Claude Code Mode Detection for Action Bar

**Decision**: Combine `session.needsInput` flag with terminal output pattern matching to detect Claude Code's current mode.

**Rationale**: The `needsInput` flag from the backend already tells us when Claude is waiting for user input. But we need to distinguish between "waiting for a text prompt" and "waiting for a permission answer (y/n)". Scanning the last few lines of terminal output for permission prompt patterns is the simplest, most reliable approach — no backend changes needed.

**Mode detection logic**:
```
if session.status !== 'active' → idle
if session.needsInput === false → generating
if session.needsInput === true:
  if last output matches permission pattern → permission
  else → input (waiting for text prompt)
```

**Permission prompt patterns** (from Claude Code's actual output):
- `Allow?` / `Deny?`
- `(y/n)` / `(Y/n)` / `(yes/no)`
- `Do you want to proceed?`
- `approve` / `reject` in the last 3 lines

**Implementation**: A `useClaudeMode` hook that:
1. Receives `session.needsInput` and `session.status` as inputs
2. Monitors terminal output buffer (xterm.js doesn't expose this easily, so we track the last N writes in a ring buffer in the `onData` callback)
3. Returns `mode: 'permission' | 'generating' | 'input' | 'idle'`

**Alternatives considered**:
- Backend detection: Would require PTY output parsing on the server — more complex, adds latency
- Regex on full scrollback: Too expensive — only need last 3-5 lines
- Hardcoded timing: Unreliable, Claude's response times vary

---

## R9: Terminal Input Injection for Action Bar Buttons

**Decision**: Use the existing `sendInput` WebSocket function to inject keypresses into the PTY.

**Rationale**: The terminal's `onData` callback already sends user input to the backend via WebSocket (`sendInput`). The action bar buttons just need to call the same function with the appropriate byte sequences. No new protocol or API needed.

**Key sequences**:
| Button | Bytes sent | Description |
|--------|-----------|-------------|
| Accept | `"y\n"` | Types 'y' + Enter |
| Reject | `"n\n"` | Types 'n' + Enter |
| Stop | `"\x03"` | Ctrl+C (ETX) |
| Tab | `"\t"` | Tab (HT) |
| Arrow Up | `"\x1b[A"` | ESC [ A |
| Arrow Down | `"\x1b[B"` | ESC [ B |
| Escape | `"\x1b"` | ESC |
| Continue | `"\n"` | Enter |

**Integration point**: The `sendInput` function is in `TerminalView.tsx` via `useWebSocket`. The `ClaudeActionBar` needs access to it — pass it as a prop from `SessionCard` which already has access to the WebSocket send function.

---

## R10: xterm.js Touch Scrolling and Scroll Position

**Decision**: Use xterm.js built-in touch scrolling + monitor `terminal.onScroll` for scroll position detection.

**Rationale**: xterm.js 5.x has built-in touch event handling for scrolling. The `terminal.onScroll` event fires when the viewport scrolls, providing the new viewport Y position. Comparing this to `terminal.buffer.active.length - terminal.rows` tells us if the user is at the bottom.

**Scroll-to-bottom detection**:
```typescript
terminal.onScroll((yPos) => {
  const maxScroll = terminal.buffer.active.length - terminal.rows;
  const isAtBottom = yPos >= maxScroll - 1; // 1-line tolerance
  setIsScrolledUp(!isAtBottom);
});
```

**Scroll-to-bottom action**: `terminal.scrollToBottom()` — already used in the codebase.

**Touch improvements**:
- `scrollSensitivity: 3` for smoother feel (default is 1, too slow on touch)
- xterm.js `ClipboardAddon` already loaded — handles long-press text selection on mobile

**Alternatives considered**:
- Custom touch scroll handler: Conflicts with xterm.js internal handling
- IntersectionObserver on last line: Over-complex for this use case
