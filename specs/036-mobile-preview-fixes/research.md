# Research: Mobile Preview UX Fixes

**Branch**: `036-mobile-preview-fixes` | **Date**: 2026-03-12

## R1: Why the Screenshot Annotation Modal Breaks on Mobile

**Decision**: The AnnotationCanvas toolbar uses a single horizontal `flex` row with no wrapping. On mobile viewports (375-440px), the row contains 4 tool buttons + 5 color buttons + undo + cancel + save = 12 items with gaps, which overflows the viewport width. The `max-w-[90vw] max-h-[90vh]` container clips the overflow, pushing the save/cancel buttons off-screen.

**Root Cause Analysis**:
- `AnnotationCanvas.tsx:193` — toolbar is `flex items-center gap-3` with no `flex-wrap`
- Save/Cancel buttons are at the end of the row (rightmost), so they're the first to overflow
- The canvas element uses `max-h-[calc(90vh-48px)]` but this doesn't account for a toolbar that might wrap to multiple lines
- No touch event handlers exist — only `onMouseDown/Move/Up` — so annotation drawing doesn't work on touch devices

**Fix Approach**:
1. Restructure toolbar for mobile: wrap tools into a compact 2-row layout with save/cancel always visible at top
2. Add touch event handlers (`onTouchStart/Move/End`) to the canvas for mobile drawing support
3. Scale the canvas image to fit the remaining viewport height after toolbar

**Alternatives Considered**:
- Making toolbar scrollable horizontally — rejected because save button would still be hidden
- Using a bottom sheet instead of modal — rejected as too much redesign for the fix

## R2: Fullscreen Preview Implementation Strategy

**Decision**: Use a simple React state toggle that conditionally renders the iframe in a `fixed inset-0 z-50` overlay, bypassing all LivePreview chrome (toolbar, device frames, scaling). No browser Fullscreen API needed — a CSS-based fullscreen is simpler and more compatible across mobile browsers.

**Rationale**:
- The browser Fullscreen API (`element.requestFullscreen()`) has inconsistent mobile support and requires user gesture
- A CSS fixed overlay achieves the same visual result without API restrictions
- The iframe URL is already available — just render it full-viewport
- Exit via a floating button positioned at top-right corner

**Alternatives Considered**:
- Browser Fullscreen API — rejected due to mobile browser inconsistencies and user gesture requirements
- Opening in a new tab — rejected because user explicitly wants in-app fullscreen
- Portal-based rendering — unnecessary complexity, fixed positioning is sufficient

## R3: Desktop Resolution Minimum Scale Strategy

**Decision**: Introduce a minimum scale floor of 0.35 for desktop presets. When the computed scale would fall below this floor, clamp to the floor and enable `overflow: auto` on the container so the user can scroll/pan to see the full preview.

**Rationale**:
- Current behavior: `scale = Math.min(scaleX, scaleY, 1)` with no lower bound
- A 4K preset (3840x2160) in a 400px panel: scale = 400/3840 ≈ 0.10 — text is unreadable
- Scale floor of 0.35: 4K in 400px panel → iframe renders at 0.35 scale (1344x756 visible area), text remains legible
- 1080p in 400px panel: scale = 400/1920 ≈ 0.21 → clamped to 0.35, also readable
- With `overflow: auto`, user can scroll to see areas outside the visible region

**Alternatives Considered**:
- No minimum floor, just enable scrolling always — rejected because small presets should still fit-to-fill
- Separate "fit" vs "actual" toggle — over-engineering for this fix
- Using CSS zoom instead of transform scale — inconsistent browser support
