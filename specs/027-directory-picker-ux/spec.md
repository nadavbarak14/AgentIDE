# Feature Specification: Directory Picker UX Improvements

**Feature Branch**: `027-directory-picker-ux`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Improve the directory chooser UX when creating a session — the DirectoryPicker browser is a plain text input that's hard to use, and the browse button is easy to miss."

## Clarifications

### Session 2026-03-06

- Q: What browsing interaction model? → A: Clickable folder list (click folder to navigate in, breadcrumb path, back button)
- Q: Where should the browser start? → A: Home directory (`~`) always
- Q: How does the user select vs navigate? → A: Single click navigates into folder; explicit "Select this folder" button confirms the current directory
- Q: Should text input remain alongside the visual browser? → A: Yes — keep text input at the top as a path bar synced with the browser (type to jump, click to browse)
- Q: Should the visual browser be the default view? → A: No — project list stays as default; browse button is moved to the top and made visually prominent

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visual Directory Browser (Priority: P1)

A user wants to select a working directory for a new session but doesn't know the exact path. Instead of typing a path manually into a text input with autocomplete, they click "Browse" and see a clickable list of folders in their home directory. They click through folders to navigate deeper, see a breadcrumb trail showing their current location, and click a "Select this folder" button when they've found the right directory. A synced text input at the top lets power users type or paste a path directly, which updates the browser view.

**Why this priority**: This is the core pain point — the current DirectoryPicker is just a text input with autocomplete, which is unintuitive for browsing the filesystem. A visual folder browser is the single biggest UX improvement.

**Independent Test**: Can be tested by opening the browse view, clicking through 2-3 levels of folders, verifying breadcrumbs update, then clicking "Select this folder" to confirm.

**Acceptance Scenarios**:

1. **Given** the user clicks "Browse", **When** the browser opens, **Then** they see a list of folders in their home directory, a path bar at the top showing `~`, and a back button (disabled at root).
2. **Given** the user clicks a folder named "projects", **When** the folder list updates, **Then** the path bar shows `~/projects`, the breadcrumb trail shows `~ / projects`, and the folder list shows contents of `~/projects`.
3. **Given** the user is viewing `~/projects/my-app`, **When** they click "Select this folder", **Then** `~/projects/my-app` is set as the working directory and the browser closes, returning to the selected state display.
4. **Given** the user types `/var/log` in the path bar, **When** the path is valid, **Then** the folder list updates to show contents of `/var/log`.
5. **Given** the user is 3 levels deep, **When** they click the back button or a breadcrumb segment, **Then** the browser navigates to the parent or clicked breadcrumb location.

---

### User Story 2 - Better Path Visibility (Priority: P1)

A user has multiple projects in similarly-named directories (e.g., `~/projects/api`, `~/work/api`). The current aggressive path truncation (`abbreviatePath` shows only last 2 segments) makes these indistinguishable. The user needs to see enough of the path to differentiate projects at a glance.

**Why this priority**: If users can't tell projects apart, they pick the wrong one. This causes wasted time and frustration.

**Independent Test**: Can be tested by creating projects with similar leaf directory names but different parent paths, and verifying that enough path context is shown to distinguish them.

**Acceptance Scenarios**:

1. **Given** two projects at `/home/user/work/api` and `/home/user/personal/api`, **When** both appear in the project list, **Then** each shows enough path context to distinguish them (e.g., `~/work/api` vs `~/personal/api`).
2. **Given** a project with a short path like `~/myproject`, **When** it appears in the list, **Then** the full path is shown without truncation.
3. **Given** a very long path, **When** it appears in the list, **Then** it truncates from the left (preserving the meaningful trailing segments) with an ellipsis, and the full path is available on hover via a tooltip.

---

### User Story 3 - Prominent Browse Button (Priority: P2)

The "Browse for directory..." button is currently a subtle dashed-border element at the bottom of the project list that's easy to miss. It should be moved to the top of the project picker area and made visually prominent with a solid border and folder icon, so users immediately see how to browse for a new directory.

**Why this priority**: Discoverability of the browse action is critical for first-time users. The project list remains the default view, but the browse entry point must be immediately visible.

**Independent Test**: Can be tested by verifying the browse button appears at the top of the picker area, has a folder icon, and is visually distinct from the project list.

**Acceptance Scenarios**:

1. **Given** no directory is selected, **When** the user views the session form, **Then** the browse button appears at the top of the project picker area with a folder icon and solid border.
2. **Given** the user has saved projects, **When** they view the picker, **Then** the browse button is visible above the project list without scrolling.
3. **Given** the user has no saved projects, **When** they view the picker, **Then** the browse button is the primary call-to-action.

---

### User Story 4 - Improved Selected State and Project List (Priority: P2)

When a directory is selected, the clear button is a plain "x" text character. The project list max-height is too small (~4 visible items). Both need better treatment.

**Why this priority**: Polish that reduces friction — the clear button needs a proper icon, and the list needs more breathing room to reduce scrolling.

**Independent Test**: Can be tested by selecting a directory and verifying the clear button has a proper icon with hover state, and by creating 8+ projects and verifying more are visible.

**Acceptance Scenarios**:

1. **Given** a directory is selected, **When** the user views the selected state, **Then** the clear button uses a proper close icon with a visible hover state.
2. **Given** a directory is selected, **When** the user hovers the selected directory display, **Then** the full path is visible via tooltip.
3. **Given** the user has 8 projects, **When** they view the project list, **Then** at least 6 are visible without scrolling.
4. **Given** the sidebar has limited vertical space, **When** the project list grows, **Then** it caps at a reasonable max height without pushing the Create Session button off-screen.

---

### Edge Cases

- What happens when the browser navigates to an empty directory (no subdirectories)? Show an empty state message ("No subdirectories") with the "Select this folder" button still available.
- What happens when the user types an invalid path in the path bar? Show a "Path not found" indicator and keep the browser at its last valid location.
- What happens on narrow sidebar widths (w-80 = 320px)? Breadcrumbs should wrap or truncate gracefully; folder names should truncate with ellipsis.
- What happens with very long folder names in the browser? Truncate with ellipsis, full name on hover tooltip.
- What happens when the browser is open for a remote worker? The existing remote directory listing API is used; the visual browser works the same way.
- What happens when the user navigates to a permission-denied directory? Show an error message ("Cannot access directory") and keep the browser at the parent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The DirectoryPicker MUST provide a visual folder browser that displays a clickable list of subdirectories in the current location.
- **FR-002**: Clicking a folder in the browser MUST navigate into that folder (updating the displayed contents and path bar).
- **FR-003**: The browser MUST provide an explicit "Select this folder" button to confirm the current directory as the working directory.
- **FR-004**: The browser MUST display a breadcrumb trail showing the current path, with each segment clickable for quick navigation.
- **FR-005**: The browser MUST include a back button to navigate to the parent directory.
- **FR-006**: A synced text input (path bar) MUST appear at the top of the browser — typing a path updates the browser location, and navigating via clicks updates the text input.
- **FR-007**: The browser MUST always start at the user's home directory (`~`).
- **FR-008**: The "Browse for directory" button MUST be positioned at the top of the project picker area (above the project list) with a solid border and folder icon.
- **FR-009**: The project list remains the default view; the browse button opens the visual browser when clicked.
- **FR-010**: The path display for each project row MUST show enough context to distinguish projects with similar directory names (intelligent `~` abbreviation, truncate from left, tooltip for full path).
- **FR-011**: The selected directory clear button MUST use a proper close icon with a visible hover state.
- **FR-012**: The project list MUST have a larger default max-height (at least 240px / ~6 visible items).
- **FR-013**: The project list max-height MUST NOT push the Create Session button off the visible area of the sidebar.
- **FR-014**: The visual browser MUST work for both local and remote worker directories (using the existing directory listing API).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can select a working directory by browsing visually (clicking folders) without typing any path manually.
- **SC-002**: Users can navigate to a directory 3 levels deep in under 5 seconds using the visual browser.
- **SC-003**: Users can visually distinguish between projects with identical directory names but different parent paths without hovering for tooltips.
- **SC-004**: At least 6 project rows are visible in the project list without scrolling (up from ~4 currently).
- **SC-005**: First-time users can discover the browse action without guidance — the button is at the top with a folder icon.
- **SC-006**: All improvements work within the existing 320px sidebar width without layout overflow or visual breakage.

## Assumptions

- The existing directory listing API (`directories.list()` and `workers.directories()`) is sufficient — no backend changes needed. The API already supports listing contents of a given directory path.
- The sidebar width remains fixed at `w-80` (320px). No responsive/resizing behavior is needed.
- The existing ProjectPicker/DirectoryPicker component structure is modified — the DirectoryPicker is enhanced with visual browsing, not replaced with a new component.
- Tooltip behavior uses the native browser `title` attribute for simplicity.
- The home directory prefix (`/home/username/` or similar) can be detected and replaced with `~` for display purposes.
- The browser only shows directories (not files), matching the current DirectoryPicker behavior.
