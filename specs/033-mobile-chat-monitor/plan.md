# Implementation Plan: Mobile Chat Monitor UX

**Branch**: `033-mobile-chat-monitor` | **Date**: 2026-03-11 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/033-mobile-chat-monitor/spec.md`
**Design**: User selected "Design A: Chat Monitor" from interactive mockup comparison — see `designs/mockup-comparison.html`

## Summary

Redesign the mobile experience (<768px) as a full-screen Claude terminal monitor with overlay panels, replacing the current desktop-layout-in-a-phone approach. The core change: on mobile, the Claude terminal is the only default view, with all other panels (Files, Git, Preview, Shell) opening as full-screen sheet overlays via a hamburger menu. Tool approval prompts appear as prominent overlay cards with large tap targets. The desktop layout (≥768px) remains completely unchanged.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: React 18, Tailwind CSS 3, xterm.js 5, Vite 6
**Storage**: N/A — no schema changes, frontend-only feature
**Testing**: Vitest + @testing-library/react (unit), Playwright (e2e via existing test infra)
**Target Platform**: Mobile browsers (iOS Safari, Chrome Android) via responsive web app
**Project Type**: Web application (frontend-only changes for this feature)
**Performance Goals**: 60fps animations for sheet overlays, <100ms response to tap actions
**Constraints**: Must not regress desktop layout. Mobile breakpoint at 768px (widening existing 640px).
**Scale/Scope**: ~8 new/modified React components, ~2 new hooks, 0 backend changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Comprehensive Testing | PASS | Unit tests for new components, e2e tests for mobile viewport flows |
| II. UX-First Design | PASS | This IS a UX improvement — driven by hands-on mobile testing |
| III. (Not listed) | N/A | |
| IV. Simplicity | PASS | Single new `MobileLayout` component wrapping existing components. No new abstractions beyond what's needed |
| V. CI/CD Pipeline | PASS | Standard branch → PR → CI → merge workflow |
| VI. Frontend Plugin Quality | PASS | No new dependencies — uses existing React, Tailwind, xterm.js |
| VII. Backend Security | PASS | No backend changes |
| VIII. Observability | PASS | No logging changes needed (frontend-only) |

All gates pass. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/033-mobile-chat-monitor/
├── spec.md
├── plan.md              # This file
├── research.md          # Phase 0: technical research
├── quickstart.md        # Phase 1: dev setup guide
├── designs/
│   ├── mockup-comparison.html   # Interactive mockup (Design A selected)
│   ├── mockup-v1.html           # First iteration mockups
│   └── screenshots/             # 14 screenshots from UX testing
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   ├── MobileLayout.tsx          # NEW: top-level mobile layout wrapper
│   │   ├── MobileTopBar.tsx          # NEW: slim top bar (hamburger + session + badge)
│   │   ├── MobileActionBar.tsx       # NEW: bottom action keys (Tab/↑/↓/Esc/Enter/Stop/⇧⇧)
│   │   ├── MobileHamburgerMenu.tsx   # NEW: full-screen panel navigation menu
│   │   ├── MobileSheetOverlay.tsx    # NEW: generic full-screen sheet for panels
│   │   ├── MobileApprovalCard.tsx    # NEW: tool approval overlay card
│   │   ├── MobileSessionList.tsx     # NEW: full-screen session list with rich cards
│   │   ├── MobilePreviewSheet.tsx    # NEW: full-screen preview (URL bar + close only)
│   │   ├── ClaudeActionBar.tsx       # MODIFY: extract shared logic, mobile variant
│   │   ├── MobileSessionSelector.tsx # MODIFY: integrate with new session list
│   │   ├── TerminalView.tsx          # MODIFY: full-screen mode for mobile
│   │   ├── LivePreview.tsx           # MODIFY: full-screen sheet mode for mobile
│   │   └── WaitingSessionAlert.tsx   # MODIFY: integrate with approval card
│   ├── pages/
│   │   └── Dashboard.tsx             # MODIFY: route to MobileLayout when isMobile
│   └── hooks/
│       ├── useVisualViewport.ts      # MODIFY: change breakpoint from 640px to 768px
│       └── useMobilePanel.ts         # NEW: state management for mobile panel overlays
└── tests/
    ├── components/
    │   ├── MobileLayout.test.tsx           # NEW
    │   ├── MobileApprovalCard.test.tsx     # NEW
    │   ├── MobileActionBar.test.tsx        # NEW
    │   └── MobileSessionList.test.tsx      # NEW
    └── unit/
        └── hooks/
            └── useMobilePanel.test.ts      # NEW
```

**Structure Decision**: Frontend-only changes following existing web application structure. All new mobile components are in `frontend/src/components/` prefixed with `Mobile*`. No backend changes. No new dependencies.

## Complexity Tracking

No constitution violations. No complexity justification needed.
