# Quickstart: Mobile Extensions & Projects Relocation

**Feature**: 044-mobile-extensions-projects
**Date**: 2026-03-29

## Prerequisites

- Node.js 20 LTS
- Existing dev environment set up (`npm install` done)
- Access to a mobile viewport (browser DevTools responsive mode or real device)

## Development Setup

```bash
# 1. Switch to feature branch
git checkout 044-mobile-extensions-projects

# 2. Install dependencies (no new ones needed)
npm install

# 3. Start dev server
npm run dev

# 4. Open in browser, use DevTools mobile viewport (375x667 or similar)
```

## Key Files to Edit

| Order | File | Change |
|-------|------|--------|
| 1 | `frontend/src/components/MobileExtensionTabs.tsx` | **NEW** — tabbed extension quick-switch component |
| 2 | `frontend/src/components/MobileTopBar.tsx` | Add projects icon button to right section |
| 3 | `frontend/src/components/MobileHamburgerMenu.tsx` | Remove Projects from menu items array |
| 4 | `frontend/src/components/MobileLayout.tsx` | Wire projects icon, replace extension panel with MobileExtensionTabs |
| 5 | `frontend/tests/components/mobile-extensions-projects.test.tsx` | **NEW** — tests for this feature |

## Verification

```bash
# Run tests
npm test

# Run lint
npm run lint

# Manual verification on mobile viewport:
# 1. Projects icon visible in top bar → tapping opens projects panel
# 2. Hamburger menu no longer has Projects item
# 3. Open Extensions from hamburger → enable 2+ extensions → see tabbed view
# 4. Tap between extension tabs → content switches correctly
# 5. Board commands still work (e.g., work-report file_changed)
```

## Architecture Notes

- **No backend changes** — all work is frontend React components
- **No schema changes** — no database modifications
- **No new dependencies** — uses existing React, Tailwind, and component library
- **Single-panel model preserved** — `useMobilePanel` still manages one overlay at a time
- **Extension iframes destroyed on tab switch** — not kept alive (memory optimization for mobile)
- **Existing extension API works as-is** — enable/disable via `PUT /api/sessions/:id/extensions`
