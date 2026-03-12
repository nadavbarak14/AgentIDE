# Implementation Plan: Mobile Preview UX Fixes

**Branch**: `036-mobile-preview-fixes` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/036-mobile-preview-fixes/spec.md`

## Summary

Three targeted frontend fixes to the preview system: (1) make the screenshot annotation modal usable on mobile by restructuring the toolbar layout and adding touch support, (2) add a fullscreen preview mode that removes all IDE chrome so the preview fills the entire screen, and (3) prevent desktop resolution previews from shrinking to unreadably small sizes by introducing a minimum scale floor with scroll/pan overflow.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, Vite 6
**Storage**: N/A — no database or schema changes
**Testing**: Vitest 2.1.0, @testing-library/react, manual mobile viewport testing
**Target Platform**: Web (desktop browsers 1024px+, mobile browsers 375px+)
**Project Type**: Web application (frontend-only changes)
**Performance Goals**: No performance regressions — CSS layout changes only
**Constraints**: No new npm dependencies, no backend changes
**Scale/Scope**: 3 files modified, ~150-200 lines changed

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for scale clamping logic; manual visual testing for layout |
| II. UX-First Design | PASS | All three fixes are UX-driven — fixing broken workflow, adding requested feature, improving readability |
| III. UI Quality & Consistency | PASS | Responsive layouts, consistent with existing design language |
| IV. Simplicity | PASS | Minimal changes — CSS layout restructuring, one state toggle, one math clamp |
| V. CI/CD Pipeline | PASS | Standard branch + PR flow |
| VI. Frontend Plugin Quality | PASS | No new dependencies |
| VII. Backend Security | N/A | No backend changes |
| VIII. Observability | N/A | No backend changes |

## Project Structure

### Documentation (this feature)

```text
specs/036-mobile-preview-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (component interfaces)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── AnnotationCanvas.tsx   # P1: mobile-responsive toolbar + touch events
│   │   ├── LivePreview.tsx        # P2: fullscreen mode + P3: min scale floor
│   │   └── PreviewOverlay.tsx     # P2: fullscreen button in overlay toolbar
│   └── hooks/
│       └── useVisualViewport.ts   # Existing — isMobile detection (no changes)
```

**Structure Decision**: Frontend-only changes to 3 existing component files. No new files needed.

## Implementation Design

### P1: Mobile-Responsive Annotation Canvas (`AnnotationCanvas.tsx`)

**Current Problem**: Single-row toolbar with 12 items overflows on 375px mobile viewports, pushing Save/Cancel off-screen.

**Design**:
1. **Toolbar restructure**: On mobile (detected via container width or media query), use a compact two-row layout:
   - Row 1: Save + Cancel buttons (always visible, top-right) + tool selector
   - Row 2: Color picker + Undo
2. **Canvas scaling**: After toolbar renders, calculate remaining viewport height and scale the canvas image to fit within it using `object-fit: contain` style or max-height constraint
3. **Touch events**: Add `onTouchStart`, `onTouchMove`, `onTouchEnd` handlers that map touch coordinates to canvas coordinates (same logic as mouse events, using `e.touches[0]`)

**Key Code Changes**:
- Wrap toolbar with `flex-wrap` and reorder so Save/Cancel come first (visually) on narrow screens
- Add responsive breakpoint: if viewport width < 640px, use stacked layout
- Canvas: add `touch-action: none` to prevent browser scroll during drawing
- Map touch events through the same `getCanvasPos` helper (adapted for `Touch` objects)

### P2: Fullscreen Preview Mode (`LivePreview.tsx` + `PreviewOverlay.tsx`)

**Current Problem**: No way to see preview without IDE chrome eating viewport space.

**Design**:
1. **State**: Add `isFullscreen` boolean state in `LivePreview`
2. **Toggle**: Add fullscreen button to `PreviewOverlay` toolbar (next to inspect/screenshot/record buttons)
3. **Rendering**: When `isFullscreen` is true, render the iframe in a `fixed inset-0 z-[60]` overlay with a floating exit button
4. **iframe**: Reuse the same `iframeRef` — just re-parent it visually via conditional rendering
5. **Exit**: Floating button at top-right with semi-transparent background, plus Escape key handler

**Key Code Changes**:
- `LivePreview.tsx`: Add `isFullscreen` state, pass to `PreviewOverlay` as prop and callback
- `PreviewOverlay.tsx`: Add fullscreen toggle button, receive `isFullscreen` + `onToggleFullscreen` props
- `LivePreview.tsx`: Conditional render — when fullscreen, render iframe in fixed overlay instead of normal viewport mode container

### P3: Desktop Resolution Minimum Scale Floor (`LivePreview.tsx`)

**Current Problem**: `scale = Math.min(scaleX, scaleY, 1)` has no lower bound. Large presets (4K: 3840x2160) in small panels become unreadably tiny.

**Design**:
1. **Minimum scale**: `const MIN_DESKTOP_SCALE = 0.35`
2. **Clamping**: `const scale = Math.max(Math.min(scaleX, scaleY, 1), MIN_DESKTOP_SCALE)`
3. **Overflow**: When `scale === MIN_DESKTOP_SCALE` (i.e., clamped), the container uses `overflow: auto` to allow scrolling
4. **Container sizing**: When clamped, the inner div's scaled dimensions may exceed the container — the `overflow-auto` parent handles this

**Key Code Changes**:
- Line 689: Change `Math.min(scaleX, scaleY, 1)` → `Math.max(Math.min(scaleX, scaleY, 1), MIN_DESKTOP_SCALE)`
- The parent div (line 683) already has `overflow-auto`, so scrolling works automatically when scaled content exceeds bounds
- Same approach for custom viewport mode (line 664-665)

## Complexity Tracking

No constitution violations. All changes follow simplicity principle — CSS layout restructuring and simple state management.
