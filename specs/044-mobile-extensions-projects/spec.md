# Feature Specification: Mobile Extensions & Projects Relocation

**Feature Branch**: `044-mobile-extensions-projects`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "we need to make sure all extensions work in mobile. we can see the views and support more than one extension. also the projects shouldn't be in the hamburger that is about one session it should be somewhere else"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View and Interact with Multiple Extensions on Mobile (Priority: P1)

A mobile user opens the app and wants to use extensions (e.g., work-report, frontend-design) alongside their active session. Currently, mobile only shows a list of extensions and can open one at a time via a full overlay. The user needs to quickly switch between extensions without losing context, see which extensions are enabled, and interact with extension panels that work correctly at mobile viewport sizes.

**Why this priority**: Extensions are a core differentiator of the IDE experience. If they don't work well on mobile, users are forced to switch to desktop for extension-dependent workflows, defeating the purpose of mobile support.

**Independent Test**: Can be fully tested by enabling two or more extensions on mobile, switching between them, and verifying each extension panel renders correctly and maintains state across switches.

**Acceptance Scenarios**:

1. **Given** a mobile user with an active session and multiple extensions available, **When** they open the extensions panel, **Then** they see all available extensions with their enabled/disabled status and can open any extension's panel.
2. **Given** a mobile user viewing an extension panel, **When** they switch to a different extension, **Then** the new extension panel loads correctly and the previous extension retains its enabled state.
3. **Given** a mobile user with an extension panel open, **When** they interact with the extension UI (buttons, forms, toggles), **Then** the extension responds correctly — all touch targets are usable and the layout fits the mobile viewport without horizontal scrolling.
4. **Given** a mobile user viewing an extension, **When** they close the extension overlay, **Then** they return to their previous context (conversation/terminal) without disruption.

---

### User Story 2 - Access Projects Separately from the Session Hamburger Menu (Priority: P1)

A mobile user wants to browse their projects to start a new agent or switch context. Currently, projects are buried inside the hamburger menu alongside session-specific items (kill session, settings, shell). This is confusing because projects are a cross-session concept — they exist independent of any single session. The user needs a dedicated, easily discoverable location for projects.

**Why this priority**: Projects are a top-level organizational concept. Mixing them with per-session actions in the hamburger menu creates confusion about scope and makes project navigation harder to discover. This is a usability issue affecting all mobile users who work with projects.

**Independent Test**: Can be fully tested by opening the mobile app, locating the new projects entry point (outside the hamburger), browsing projects, and starting a new agent from a project — all without opening the hamburger menu.

**Acceptance Scenarios**:

1. **Given** a mobile user on the main screen, **When** they look for projects, **Then** they find a dedicated projects access point that is visually distinct from the session hamburger menu.
2. **Given** a mobile user tapping the projects entry point, **When** the projects panel opens, **Then** they see their full project list with status indicators, session counts, and GitHub repo info.
3. **Given** a mobile user viewing the projects list, **When** they tap a project, **Then** they see project details and can start a new agent session from that project.
4. **Given** a mobile user opening the hamburger menu, **When** they look at the menu items, **Then** projects is no longer listed there — only session-scoped items remain.

---

### User Story 3 - Extension Panels Render Correctly on Mobile Viewports (Priority: P2)

A mobile user opens an extension panel (e.g., work-report) and the iframe content needs to fit properly within the mobile viewport. Extension panels designed primarily for desktop sidebars must adapt to the full-width mobile overlay without broken layouts, tiny text, or unusable controls.

**Why this priority**: Even if navigation works (P1), broken rendering makes extensions unusable. This ensures the actual content within extensions is mobile-friendly.

**Independent Test**: Can be tested by opening each available extension on a mobile viewport and verifying the content is readable, interactive elements are tappable, and no horizontal overflow occurs.

**Acceptance Scenarios**:

1. **Given** a mobile user opening the work-report extension, **When** the panel renders, **Then** the report content fills the available width, text is readable without zooming, and buttons/links are touch-friendly (minimum 44px touch targets).
2. **Given** a mobile user opening any extension with form inputs, **When** they tap a form field, **Then** the mobile keyboard opens correctly and the form field remains visible (not obscured by keyboard).
3. **Given** an extension that sends board commands or messages, **When** the user triggers that action on mobile, **Then** the command executes correctly and results appear in the appropriate panel (conversation, terminal, etc.).

---

### User Story 4 - Quick-Switch Between Extensions Without Re-navigation (Priority: P2)

A mobile user who frequently uses multiple extensions needs a way to switch between enabled extensions quickly — without going back to the extensions list, finding the other extension, and re-opening it each time.

**Why this priority**: Power users who rely on multiple extensions need efficient navigation. Without quick-switching, the two-step process (close current, open list, select new) creates friction.

**Independent Test**: Can be tested by enabling two extensions, opening one, and verifying there is a mechanism to switch directly to the other without returning to the extensions list.

**Acceptance Scenarios**:

1. **Given** a mobile user with two or more extensions enabled, **When** they are viewing one extension panel, **Then** they see a navigation mechanism (tabs, swipe, or selector) to switch to other enabled extensions.
2. **Given** a mobile user switching between extensions via the quick-switch mechanism, **When** they switch, **Then** the transition is smooth and the target extension loads within 1 second.

---

### Edge Cases

- What happens when no extensions are installed? The extensions entry point should be hidden or show an empty state message.
- What happens when all extensions are disabled for the current session? The extensions panel should show the list with all toggles off and allow enabling.
- What happens when an extension panel fails to load (iframe timeout)? A clear error message should appear with a retry option, consistent with the existing 5-second timeout behavior.
- What happens on viewport rotation (portrait to landscape)? Extension panels and the projects panel should adapt to the new dimensions without requiring a page reload.
- What happens when the user has no projects? The projects entry point should show an empty state with a "Create Project" call-to-action.
- What happens when keyboard opens while an extension panel is visible? The panel should resize to remain usable above the keyboard.
- What happens to the browser preview when an overlay (extension, projects, files) opens on top? The preview iframe MUST continue running in the background — it should not be destroyed and recreated when the user returns to the preview.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated projects access point on mobile that is separate from the session hamburger menu.
- **FR-002**: System MUST remove the "Projects" item from the hamburger menu on mobile, keeping only session-scoped items (Files, Git, Preview, Shell, Settings, Issues, Extensions, Canvas, New Session, Kill Session).
- **FR-003**: System MUST display all available extensions in the mobile extensions panel with their current enabled/disabled state.
- **FR-004**: System MUST allow users to open any extension's panel as a mobile overlay and interact with its full functionality.
- **FR-005**: System MUST provide a mechanism to switch between enabled extensions without returning to the extensions list (quick-switch navigation).
- **FR-006**: System MUST pass the correct mobile viewport dimensions to extension iframes so extensions can render responsively.
- **FR-007**: System MUST maintain extension enabled/disabled state per session when switching between extensions on mobile.
- **FR-008**: System MUST forward board commands and messages between extensions and the main app correctly on mobile, matching desktop behavior.
- **FR-009**: System MUST show project list with status indicators, active session counts, and GitHub repo info in the dedicated projects panel.
- **FR-010**: System MUST allow users to create new projects and start agents from the mobile projects panel.
- **FR-011**: System MUST keep the browser preview iframe running in the background when overlay panels (extensions, projects, files, etc.) are open on mobile. The preview must not be destroyed and recreated when the user returns to it.

### Key Entities

- **Project**: A cross-session organizational unit containing a working directory, optional GitHub repo link, and associated agent sessions. Accessed via a dedicated mobile entry point.
- **Extension**: A manifest-driven plugin with optional UI panel (iframe-based), skills, and board commands. Can be enabled/disabled per session. Multiple extensions can be enabled simultaneously on mobile.
- **Mobile Panel**: A full-screen overlay sheet on mobile that displays content for one feature at a time (files, git, extension, projects, etc.).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can access projects on mobile within 1 tap from the main screen, without opening the hamburger menu.
- **SC-002**: Users can view and switch between 2+ enabled extensions on mobile within 2 taps.
- **SC-003**: All existing extensions (work-report, frontend-design) render without horizontal overflow on mobile viewports (320px-428px width).
- **SC-004**: Extension panel interactions (buttons, forms, board commands) have 100% functional parity with desktop on mobile.
- **SC-005**: The hamburger menu contains only session-scoped items — no cross-session navigation items.
- **SC-006**: Extension quick-switch transitions complete within 1 second.
