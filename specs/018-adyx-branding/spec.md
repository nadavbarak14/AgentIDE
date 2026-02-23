# Feature Specification: Adyx Frontend Branding

**Feature Branch**: `018-adyx-branding`
**Created**: 2026-02-23
**Status**: Draft
**Input**: User description: "we need to change all frontend to say adyx - this is our name"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Consistent Adyx Branding Across All Pages (Priority: P1)

As a user, when I open the application in my browser, I see "Adyx" as the product name everywhere — in the browser tab title, dashboard header, and any other visible UI locations — so that the product identity is clear and consistent.

**Why this priority**: The browser tab and main header are the most prominent brand touchpoints. Users see these immediately upon loading the app, making them the highest-impact branding elements.

**Independent Test**: Can be fully tested by opening the application and verifying "Adyx" appears in the browser tab title and main dashboard heading, with no remnants of the previous name "Multy" visible anywhere.

**Acceptance Scenarios**:

1. **Given** a user navigates to the application, **When** the page loads, **Then** the browser tab displays "Adyx" as the page title
2. **Given** a user is on the dashboard, **When** they look at the main header, **Then** the heading text reads "Adyx"
3. **Given** any page in the application, **When** the user scans visible text, **Then** no references to the old name "Multy" appear anywhere in the UI

---

### User Story 2 - Internal Naming Consistency (Priority: P2)

As a developer working on the codebase, the internal naming conventions (localStorage keys, custom events, global objects) still use the existing `c3` prefix to avoid breaking changes, but any user-visible strings or labels referencing the old product name are updated to "Adyx".

**Why this priority**: Internal code prefixes like `c3-sidebar-open` or `c3:input-sent` are not visible to users and changing them would risk breaking functionality without user-facing benefit. Keeping them stable ensures zero regression risk.

**Independent Test**: Can be tested by searching the frontend source for user-visible strings containing "Multy" and confirming none remain, while verifying `c3`-prefixed internal identifiers continue to function correctly.

**Acceptance Scenarios**:

1. **Given** the frontend source code, **When** searching for the string "Multy" in any user-visible context (HTML titles, headings, labels, alt text, placeholder text), **Then** zero results are found
2. **Given** existing features that depend on `c3`-prefixed localStorage keys and custom events, **When** the branding change is applied, **Then** all existing functionality continues to work without regression

---

### Edge Cases

- What happens if a new page or component is added in the future that hard-codes "Multy"? The pattern should be clear: all user-visible product names must say "Adyx".
- What about the `c3-frontend` package name in `package.json`? This is a developer-facing identifier, not user-visible — it can remain unchanged to avoid tooling disruption.
- What about "Claude" references in the UI (e.g., "Send to Claude", "Show Claude Code")? These refer to the Claude AI product, not the application name, and should remain unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The browser tab title MUST display "Adyx" instead of "Multy"
- **FR-002**: The main dashboard header MUST display "Adyx" instead of "Multy"
- **FR-003**: All user-visible text across the frontend MUST use "Adyx" where the application name appears
- **FR-004**: Internal code identifiers (localStorage keys prefixed `c3-`, custom events prefixed `c3:`, the global `C3` bridge object) MUST remain unchanged to avoid regressions
- **FR-005**: References to "Claude" (the AI product) MUST remain unchanged since they refer to a third-party product, not the application name

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero instances of "Multy" appear as user-visible text anywhere in the running application
- **SC-002**: "Adyx" appears as the browser tab title on every page
- **SC-003**: All existing features continue to work without regression after the branding change (no broken localStorage, events, or integrations)
- **SC-004**: The branding change is complete — no partial or mixed branding states exist in the UI

## Assumptions

- "Adyx" is the correct spelling and capitalization of the new brand name
- Only user-visible frontend text needs to change; backend and internal code identifiers are out of scope
- The `c3` prefix in code remains as-is to preserve backward compatibility
- "Claude" references in the UI are intentional third-party product references and are not part of this rebrand
- No logo, favicon, or visual identity changes are included — this is a text-only rebrand
