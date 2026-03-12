# Quickstart: Mobile Preview UX Fixes

**Branch**: `036-mobile-preview-fixes` | **Date**: 2026-03-12

## Overview

Three frontend-only fixes to the preview system. No backend changes, no database changes, no new dependencies.

## Files to Modify

| File | Change |
|------|--------|
| `frontend/src/components/AnnotationCanvas.tsx` | Mobile-responsive toolbar layout, touch events, viewport-aware canvas sizing |
| `frontend/src/components/LivePreview.tsx` | Fullscreen toggle state + UI, minimum scale floor for desktop presets |
| `frontend/src/components/PreviewOverlay.tsx` | Fullscreen button in toolbar, pass fullscreen state |

## Dev Setup

```bash
npm run dev    # Start dev server
# Open on mobile device or use browser DevTools mobile emulation
```

## Testing Approach

1. **P1 - Annotation Modal**: Open on mobile viewport (375px width), capture screenshot, verify all controls visible and Save button tappable
2. **P2 - Fullscreen**: Load preview, click fullscreen button, verify iframe fills screen, click exit to return
3. **P3 - Desktop Sizing**: Select 4K preset in a narrow panel (~400px), verify preview doesn't shrink below readable size, scrolling works

## Key Constraints

- No new npm dependencies
- No backend API changes
- No database schema changes
- Must work on both mobile (375-440px) and desktop (1024px+) viewports
