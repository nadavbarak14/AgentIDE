# Feature Specification: Mobile Preview UX Fixes

**Feature Branch**: `036-mobile-preview-fixes`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "Mobile preview fixes - screenshot annotation modal is inaccessible on mobile (save button unreachable), need fullscreen preview option to match phone screen, and desktop resolution previews render too small"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Screenshot Annotation Save Button Accessible on Mobile (Priority: P1)

A user on a mobile device captures a screenshot of their preview. The annotation canvas opens, but the save button is pushed off-screen or obscured, making it impossible to complete the screenshot workflow. The annotation modal must fit within the mobile viewport so all controls (tools, colors, save, cancel) are reachable without scrolling.

**Why this priority**: This is a broken workflow - users can trigger screenshot capture but cannot complete it. The feature is effectively non-functional on mobile, making this the highest priority fix.

**Independent Test**: Can be fully tested by opening the app on a mobile device (or mobile viewport), capturing a screenshot, and verifying all annotation controls including the Save button are visible and tappable without scrolling or zooming.

**Acceptance Scenarios**:

1. **Given** a user is on a mobile device viewing a preview, **When** they capture a screenshot (viewport or full page), **Then** the annotation canvas opens and fits entirely within the visible viewport with all controls accessible
2. **Given** the annotation modal is open on a mobile device, **When** the user looks at the modal, **Then** the Save and Cancel buttons are visible without scrolling
3. **Given** the annotation modal is open on a mobile device, **When** the user annotates and taps Save, **Then** the screenshot is saved and delivered successfully
4. **Given** the annotation modal is open on a small phone screen (e.g., 375x667), **When** the screenshot image is larger than the viewport, **Then** the image is scaled down to fit while maintaining aspect ratio, and all toolbar controls remain visible

---

### User Story 2 - Fullscreen Preview Mode (Priority: P2)

A user wants to see how their app looks on their actual phone without the surrounding IDE chrome (toolbar, address bar, device frame bezels). They activate a fullscreen option that expands the preview iframe to fill the entire screen, giving them a true 1:1 representation of their app on their device.

**Why this priority**: This directly addresses the user's request for a way to "match my phone" - seeing the preview at actual device scale without IDE chrome taking up space. High value for mobile-first development workflows.

**Independent Test**: Can be fully tested by opening a preview, activating fullscreen mode, and verifying the preview content fills the entire screen with no IDE chrome visible. Exiting fullscreen should restore the normal view.

**Acceptance Scenarios**:

1. **Given** a user has a preview loaded, **When** they tap the fullscreen button, **Then** the preview iframe expands to fill the entire screen with no toolbar, address bar, device frame bezels, or IDE panels visible
2. **Given** a user is in fullscreen preview mode, **When** they want to exit, **Then** there is a clear, accessible way to return to normal view (e.g., a floating exit button or swipe gesture)
3. **Given** a user is in fullscreen mode on a mobile device, **When** viewing, **Then** the preview content fills the full viewport at 1:1 scale (no scaling applied)
4. **Given** a user is in fullscreen mode on a desktop browser, **When** viewing with a device preset active, **Then** the preview fills the browser window at 1:1 scale (or scaled to fit if the preset is larger than the window)

---

### User Story 3 - Better Desktop Resolution Preview Sizing (Priority: P3)

When a user selects a desktop resolution preset (e.g., 1080p at 1920x1080, or 4K at 3840x2160), the preview is scaled down to fit the available panel space. On smaller screens or narrow panels, this results in a tiny, hard-to-read preview. The system should use a smarter sizing strategy that keeps the preview usable.

**Why this priority**: This is a usability improvement rather than a broken feature. The current behavior works but produces an unpleasant experience when large resolutions are squeezed into small panels.

**Independent Test**: Can be tested by selecting various desktop presets (1080p, 1440p, 4K) in panels of different sizes and verifying the preview remains readable and usable.

**Acceptance Scenarios**:

1. **Given** a user selects a desktop preset larger than their panel, **When** the preview renders, **Then** it should scale down but remain large enough that text and UI elements are still readable
2. **Given** a user selects a 4K preset (3840x2160) in a typical panel, **When** the preview renders, **Then** the preview should allow scrolling/panning rather than shrinking to an unusably small size
3. **Given** a user selects a desktop preset close to their panel size, **When** the preview renders, **Then** it should display at or near 1:1 scale without unnecessary shrinking
4. **Given** a user changes the panel size by resizing, **When** the panel grows or shrinks, **Then** the preview scale adjusts responsively

---

### Edge Cases

- What happens when the phone is rotated while the annotation modal is open? The modal should adapt to the new orientation.
- What happens when fullscreen mode is activated during a screenshot capture? The screenshot should complete before entering fullscreen, or fullscreen should be disabled during annotation.
- What happens when a desktop preset is selected but the panel is extremely narrow (< 300px)? A minimum usable scale should be enforced.
- What happens when the user enters fullscreen and then the device keyboard appears? Fullscreen should handle keyboard visibility gracefully.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The annotation canvas modal MUST fit within the mobile viewport, ensuring all controls (drawing tools, color picker, undo, save, cancel) are visible and tappable
- **FR-002**: The annotation canvas MUST scale the screenshot image to fit within the available modal space on mobile while maintaining aspect ratio
- **FR-003**: The preview panel MUST provide a fullscreen toggle button accessible from the preview toolbar
- **FR-004**: Fullscreen mode MUST hide all IDE chrome (toolbar, address bar, device frame bezels, panel borders) and expand the preview iframe to fill the available screen
- **FR-005**: Fullscreen mode MUST provide a visible exit mechanism (e.g., floating button or overlay control) to return to normal view
- **FR-006**: When a desktop resolution preset is significantly larger than the available panel, the system MUST use a minimum scale floor to prevent the preview from becoming too small to read
- **FR-007**: When a desktop preset would render below the minimum scale floor, the system MUST allow the user to scroll or pan the preview rather than shrinking it further
- **FR-008**: The fullscreen toggle MUST work on both mobile and desktop viewports

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete the full screenshot workflow (capture, annotate, save) on mobile devices without needing to scroll or zoom to reach any control
- **SC-002**: Users can enter and exit fullscreen preview mode in under 2 taps/clicks
- **SC-003**: Desktop resolution previews at 1080p or higher remain readable (text legible, buttons clickable) in panels as narrow as 400px
- **SC-004**: All three fixes work correctly across common mobile viewports (375px-440px width) and desktop viewports (1024px+ width)
