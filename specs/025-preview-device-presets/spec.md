# Feature Specification: Preview Device Presets & Layout Persistence

**Feature Branch**: `025-preview-device-presets`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Instead of showing view/full buttons directly, show them after pressing. Mobile view should have preset device options (iPhone, iPad, Samsung, etc.) with specific dimensions. These presets should be saved/persisted. Claude terminal location (up or down) and exact position should be saved."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Collapsed Screenshot/Recording Mode Selector (Priority: P1)

Currently the preview overlay toolbar shows four separate View/Full toggle buttons (two for screenshot mode, two for recording mode) that take up space and clutter the toolbar. Instead, the screenshot and recording buttons should each show a small dropdown/popover menu when clicked, allowing the user to choose between "View" (viewport) and "Full" (full page) mode before the action is triggered.

**Why this priority**: This directly addresses toolbar clutter and improves the core capture workflow. The current four-button layout is confusing - users must first select a mode, then click a separate action button. Combining selection and action into a single dropdown interaction is simpler.

**Independent Test**: Can be tested by clicking the screenshot or record button and verifying a dropdown appears with View/Full options, and that selecting one triggers the corresponding capture action.

**Acceptance Scenarios**:

1. **Given** the preview overlay is visible, **When** the user clicks the screenshot button, **Then** a small dropdown/popover appears with "View" and "Full" options
2. **Given** the screenshot dropdown is open, **When** the user selects "View", **Then** a viewport-only screenshot is captured and the dropdown closes
3. **Given** the screenshot dropdown is open, **When** the user selects "Full", **Then** a full-page screenshot is captured and the dropdown closes
4. **Given** the recording dropdown is open, **When** the user selects "View", **Then** viewport recording begins and the dropdown closes
5. **Given** the recording dropdown is open, **When** the user selects "Full", **Then** full-page recording begins and the dropdown closes
6. **Given** a dropdown is open, **When** the user clicks outside the dropdown, **Then** the dropdown closes without any action
7. **Given** recording is in progress, **When** the user clicks the record button, **Then** recording stops immediately (no dropdown shown)

---

### User Story 2 - Mobile Device Presets (Priority: P1)

When the user selects the mobile viewport mode in the preview browser chrome, instead of switching to a single fixed 360x640 resolution, a dropdown menu appears with a list of popular device presets. Each preset has a device name and its corresponding screen dimensions. Selecting a preset resizes the preview iframe to match that device's screen size, complete with the phone/tablet frame styling.

**Why this priority**: This is the core feature request - giving users the ability to test their designs across multiple realistic device dimensions rather than a single arbitrary mobile size.

**Independent Test**: Can be tested by clicking the mobile viewport button and verifying a device preset menu appears with multiple device options, and that selecting one resizes the preview to the correct dimensions.

**Acceptance Scenarios**:

1. **Given** the preview is in desktop mode, **When** the user clicks the mobile viewport button, **Then** a dropdown appears showing a list of device presets grouped by category (phones, tablets)
2. **Given** the device preset dropdown is open, **When** the user selects "iPhone 15 Pro", **Then** the preview resizes to 393x852 with a phone-style frame
3. **Given** the device preset dropdown is open, **When** the user selects "iPad Air", **Then** the preview resizes to 820x1180 with a tablet-style frame
4. **Given** a device preset is active, **When** the user clicks the desktop viewport button, **Then** the preview returns to full-width desktop mode
5. **Given** the device preset dropdown is open, **When** the user clicks outside the dropdown, **Then** the dropdown closes and the current viewport mode remains unchanged
6. **Given** a device preset is active, **When** the user clicks the mobile button again, **Then** the dropdown reappears with the current preset highlighted

---

### User Story 3 - Device Preset Persistence (Priority: P2)

When a user selects a device preset, that selection is saved and restored the next time the session is opened. The last-used device preset is remembered per session so the user doesn't have to reselect their preferred device every time.

**Why this priority**: Saves user time and reduces friction when repeatedly testing on the same device size. Builds on top of Story 2.

**Independent Test**: Can be tested by selecting a device preset, refreshing the page or reopening the session, and verifying the same preset is restored.

**Acceptance Scenarios**:

1. **Given** the user has selected "iPhone 15 Pro" as a device preset, **When** the user refreshes the page, **Then** the preview loads with the "iPhone 15 Pro" preset dimensions and the preset is shown as selected
2. **Given** the user has selected "iPad Air" in session A, **When** the user opens session B which has no saved preset, **Then** session B defaults to desktop mode (presets are per-session)
3. **Given** the user switches from a device preset to desktop mode, **When** the page is refreshed, **Then** the preview loads in desktop mode (desktop choice is also persisted)

---

### User Story 4 - Terminal Position Persistence (Priority: P2)

The Claude terminal's position (center or bottom) and its exact layout size should be saved and restored across page reloads and session reopens. Currently the terminal position is saved, but the user wants to ensure that both the position choice AND the exact panel height/size are reliably persisted.

**Why this priority**: Reduces repetitive layout adjustments. Users who prefer the terminal at the bottom shouldn't have to move it there every session.

**Independent Test**: Can be tested by moving the terminal to bottom position, adjusting its height, refreshing, and verifying both position and height are restored.

**Acceptance Scenarios**:

1. **Given** the user has moved the terminal to the "bottom" position, **When** the page is refreshed, **Then** the terminal loads in the "bottom" position
2. **Given** the user has the terminal at "bottom" and resizes the bottom panel to 60% height, **When** the page is refreshed, **Then** the terminal loads at "bottom" with 60% height
3. **Given** the user has the terminal in "center" position, **When** the page is refreshed, **Then** the terminal loads in "center" position
4. **Given** the user changes the terminal from "bottom" to "center" while panels are open, **When** the page is refreshed, **Then** the terminal loads in "center" position (last explicit user choice is preserved)

---

### Edge Cases

- What happens when the preview container is too small to fit a large tablet preset (e.g., iPad Pro 12.9")? The preview should scale down proportionally to fit within the available space, similar to the existing custom viewport scaling behavior.
- What happens when a saved device preset is removed from the presets list in a future update? The system should fall back to desktop mode and clear the stale preset reference.
- What happens when the user clicks the screenshot dropdown while recording is in progress? The screenshot dropdown should still work normally - capturing a screenshot mid-recording is valid.
- What happens when the dropdown is open and the user presses Escape? The dropdown should close.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The screenshot capture button MUST show a dropdown with "View" (viewport) and "Full" (full page) options when clicked, instead of showing separate toggle buttons
- **FR-002**: The recording button MUST show a dropdown with "View" and "Full" options when clicked (only when not currently recording)
- **FR-003**: When recording is active, clicking the record button MUST stop recording immediately without showing a dropdown
- **FR-004**: The mobile viewport button MUST show a dropdown with device presets when clicked, instead of immediately switching to a fixed mobile size
- **FR-005**: The device preset list MUST include at minimum the following devices with their standard screen dimensions:
  - **Phones**: iPhone SE (375x667), iPhone 14 (390x844), iPhone 15 Pro (393x852), iPhone 16 Pro Max (440x956), Samsung Galaxy S24 (360x780), Google Pixel 8 (412x915)
  - **Tablets**: iPad Mini (768x1024), iPad Air (820x1180), iPad Pro 11" (834x1194), iPad Pro 12.9" (1024x1366), Samsung Galaxy Tab S9 (800x1280)
- **FR-006**: Device presets MUST be grouped by category (Phones, Tablets) in the dropdown menu
- **FR-007**: The currently active device preset MUST be visually indicated in the dropdown
- **FR-008**: When a device preset is selected, the preview MUST render with the device's dimensions and appropriate frame styling (phone frame for phones, tablet frame for tablets)
- **FR-009**: Large device presets that exceed the available container space MUST be scaled down proportionally to fit
- **FR-010**: The selected device preset MUST be persisted per session and restored on page reload
- **FR-011**: The terminal position (center/bottom) MUST be persisted per session and restored on page reload
- **FR-012**: The terminal's panel height percentage MUST be persisted per session and restored on page reload
- **FR-013**: All dropdowns MUST close when clicking outside of them or pressing Escape
- **FR-014**: The previous separate View/Full toggle buttons for screenshot and recording MUST be removed from the toolbar

### Key Entities

- **Device Preset**: A named device configuration with a display name, category (phone/tablet), width, and height. Presets are read-only and built into the application.
- **Panel State**: The persisted layout configuration for a session, including terminal position, panel heights, viewport mode, and selected device preset identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The preview toolbar shows fewer buttons than before (4 toggle buttons removed, replaced by 2 dropdown triggers), reducing visual clutter
- **SC-002**: Users can switch between at least 11 device presets in under 2 clicks (one click to open dropdown, one to select)
- **SC-003**: Selected device preset is correctly restored after page reload 100% of the time
- **SC-004**: Terminal position and height are correctly restored after page reload 100% of the time
- **SC-005**: All dropdowns dismiss within one user action (click outside or Escape)
- **SC-006**: Device preset dimensions match real-world device specifications within 1 pixel accuracy
