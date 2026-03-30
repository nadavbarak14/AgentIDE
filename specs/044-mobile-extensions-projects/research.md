# Research: Mobile Extensions & Projects Relocation

**Feature**: 044-mobile-extensions-projects
**Date**: 2026-03-29

## Research Questions & Findings

### R1: Where should the projects entry point go?

**Decision**: Add a folder/projects icon to the **MobileTopBar**, to the left of the existing New Session button on the right side.

**Rationale**:
- The MobileTopBar currently has: hamburger (left) | session info (center) | fullscreen + new session (right)
- Projects are a top-level navigation concept, warranting a persistent visible entry point
- The top bar has visual space on the right side for one more icon
- A bottom tab bar was considered but rejected — it would conflict with the MobileActionBar (terminal input) and the existing keyboard offset logic
- A swipe gesture was considered but rejected — too hidden, poor discoverability

**Alternatives considered**:
1. Bottom tab bar — conflicts with MobileActionBar, would require significant restructuring
2. Floating action button — inconsistent with existing design language (no FABs used)
3. Long-press on hamburger — too hidden, no discoverability
4. Separate sidebar drawer — overcomplicates the single-panel overlay model

### R2: How should extension quick-switching work?

**Decision**: Add a **horizontal tab bar** at the top of the extension overlay, showing enabled extension names. Tapping a tab switches the iframe below it.

**Rationale**:
- The `MobileSheetOverlay` already has a header area — the tab bar slots in below the title
- Only enabled extensions with panels appear as tabs (filtered from `extensionsWithPanel`)
- The "Extensions" entry in the hamburger still opens the extensions panel, but now that panel has two modes:
  - If no extension is active yet: show the extension list (current behavior)
  - If an extension is active: show the tabbed view with the active extension's panel
- A settings/gear icon in the tabbed view header opens the extension list for enable/disable management

**Alternatives considered**:
1. Swipe left/right between extensions — conflicts with in-extension horizontal scrolling
2. Dropdown selector — extra tap required, worse than tabs for 2-3 items
3. Keep current list-then-open — doesn't satisfy the quick-switch requirement (FR-005)

### R3: Should extension iframes be kept alive or destroyed on tab switch?

**Decision**: **Destroy and recreate** iframes when switching tabs. Do not keep multiple iframes mounted simultaneously.

**Rationale**:
- Mobile devices have limited memory — mounting 2-3 iframes simultaneously is wasteful
- Extensions already handle the `init` message on load and reach `ready` state in <1 second
- The existing `ExtensionPanel` component manages its own lifecycle cleanly
- Keeping iframes alive would require significant refactoring of the panel ref system

**Alternatives considered**:
1. Keep all iframes mounted but hidden (`display: none`) — memory waste on mobile, some iframes may continue consuming CPU
2. Use `visibility: hidden` — same memory concerns, plus accessibility issues

### R4: How to pass viewport info to extension iframes?

**Decision**: Extension iframes already receive the full available width via CSS (`width: 100%` in the `MobileSheetOverlay` content area). No additional viewport messaging is needed.

**Rationale**:
- Both work-report and frontend-design extensions already have `<meta name="viewport" content="width=device-width, initial-scale=1.0">` in their HTML
- Both use responsive CSS (flexbox, auto-fill grid) that adapts to container width
- The iframe `sandbox="allow-scripts allow-same-origin"` attribute doesn't restrict viewport awareness
- Adding explicit width/height messages would be redundant — CSS already handles this

### R5: What happens to the `'project-detail'` panel type?

**Decision**: Keep it. The flow is: tap projects icon → opens `'projects'` panel → tap a project → opens `'project-detail'` panel. This is unchanged — only the entry point moves from hamburger to top bar.

**Rationale**:
- The project detail view and create project modal already work correctly on mobile
- No changes needed to `ProjectDetail` component or the create project flow
- The `useMobilePanel` hook already supports both panel types

### R7: How should the browser preview survive overlay panels?

**Decision**: Change the preview rendering from conditional mount (`activePanel === 'preview'`) to **always-mounted but visibility-toggled**. The `MobilePreviewSheet` stays mounted whenever there's a `currentSessionId` and `previewPort`, but uses `display: none` when another panel is active and `display: block` when the preview panel is active.

**Rationale**:
- Currently the preview iframe is destroyed when any overlay (extensions, projects, files) opens because it's conditionally rendered based on `activePanel`
- Reloading the preview every time the user returns to it is slow and loses scroll position / page state
- The preview iframe is lightweight compared to extension iframes — it's a single page load, not an app
- Using `display: none` preserves iframe state without consuming layout/paint resources
- This only applies to the preview — extension iframes are still destroyed on switch (R3) because multiple extension iframes are heavier

**Alternatives considered**:
1. Cache preview URL and reload fast — still loses page state (form inputs, scroll position)
2. Use `visibility: hidden` + `position: absolute` — keeps layout cost, unnecessary
3. Move preview to a portal outside the panel system — overcomplicates the architecture

### R6: What existing tests need updating?

**Decision**: Update `preview-and-extensions-fixes.test.tsx` to account for the new tab behavior. Add a new `mobile-extensions-projects.test.tsx` for dedicated coverage of:
- Projects icon renders in MobileTopBar
- Projects item removed from MobileHamburgerMenu
- Extension tab bar renders for enabled extensions
- Tab switching changes active extension
- Extension list accessible from tabbed view

**Rationale**:
- Existing tests verify extension ref forwarding and board commands — those should still pass
- New tests needed for the relocated projects entry point and tab switching behavior
- Constitution Principle I requires tests for all new features
