# Feature Specification: Extension System

**Feature Branch**: `012-extension-system`
**Created**: 2026-02-21
**Status**: Draft
**Input**: Extension system with skills, layout panels, and a test "Frontend Design" extension — no backend changes required

## Clarifications

### Session 2026-02-21

- Q: How should extension selection work across sessions? → A: Per-session opt-in. No extensions are enabled by default. The user selects which extensions to enable when creating or during a session. Extensions are available globally (served dynamically from the extensions/ directory at runtime) but each session chooses which ones it uses.
- Q: Where does the user select extensions for a session? → A: Toolbar dropdown. A dropdown/popover in the session toolbar where the user checks/unchecks available extensions. Selected (enabled) extensions appear as panel toggle buttons in the toolbar, just like built-in panels.
- Q: Should per-session extension selection persist across page refreshes? → A: Yes, persist in the existing `panel_states` SQLite table. Store enabled extensions as an array in the per-session panel state JSON blob. Survives refresh and server restart, zero schema migration needed.
- Q: How should users "copy and save" extensions? → A: Install from path. An "Install Extension" button that copies an extension folder from a given local path into the global `extensions/` directory. Extensions are just folders on disk — "installing" means copying files. They then appear in the toolbar dropdown for any session.
- Q: How should auto-skill naming and discovery work? → A: Auto-generate per extension. When an extension loads, skill files are auto-created with the extension name as prefix (e.g., `/frontend-design.open`, `/frontend-design.comment`, `/frontend-design.select-text`). The agent discovers them naturally like any other skill.
- Q: What does the "select text" auto-skill do? → A: User-initiated. When the user selects/highlights text in the extension iframe, they can send it as a comment with context (screen name, selected text, optional user note).
- Q: What does the "comment" auto-skill do? → A: Agent-prompted. The agent calls the skill to ask the user for feedback — it opens the extension tab, navigates to the named screen, and enables inspect mode, prompting the user to comment.
- Q: Can extensions still declare custom skills alongside auto-skills? → A: Yes. Auto-skills are always generated for every extension with a panel. Extensions can additionally declare custom skills in their manifest. Both coexist.
- Q: How does the browser discover extensions without filesystem access? → A: The Vite plugin generates an `extensions/index.json` manifest listing all available extensions. The frontend fetches this file instead of scanning directories. The index is regenerated on dev-server start and at build time.
- Q: How does the comment auto-skill interact with extensions that don't support inspect mode? → A: The `<ext-name>.comment` auto-skill is generic — it opens the extension panel and sends a `board-command` with `command: 'enable-inspect'`. The extension decides how to handle it. Extensions that don't support inspect mode simply ignore the command.
- Q: What is the terminology convention for board commands? → A: `board_command` (snake_case) is used in WebSocket messages and backend code (existing convention). `board-command` (kebab-case) is used in postMessage protocol between host and extension iframes. Both refer to the same concept at different transport layers.
- Q: How are new extension skills created? → A: Inside a Claude Code session. The agent writes skill files following the manifest convention (SKILL.md + scripts in the extension's skills/ directory). No special frontend UI for authoring — the agent has filesystem access and generates the files directly.
- Q: How does the system discover newly created skills without a restart? → A: A manual "Refresh Skills" button in the UI triggers `npm run register-extensions` via the session's existing command mechanism. This re-runs the register script, picking up new or changed skill files.
- Q: Does the extension system need special scaffolding or templates for skill creation? → A: No. Convention-only. The agent follows the established pattern (manifest.json skills array, SKILL.md + scripts directory). The register script handles symlinking into `.claude-skills/skills/`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extension Discovery and Panel Display (Priority: P1)

A developer creates an extension folder with a manifest file and a UI entry point (HTML file). When the application loads, it discovers all extensions, registers them in the panel picker alongside built-in panels (files, git, preview, issues), and renders the extension's UI in an iframe when the user selects it. No backend changes are needed — extensions are purely frontend artifacts served as static files.

**Why this priority**: This is the foundation. Without discovering and displaying extension panels, nothing else works. This establishes the manifest convention, the loader, and the generic iframe panel — the minimum needed to prove extensions work.

**Independent Test**: Create a minimal extension with a manifest and an `index.html` that displays "Hello from Extension". Open the panel picker, select the extension, and confirm the iframe renders its content.

**Acceptance Scenarios**:

1. **Given** an extension folder exists at `extensions/my-ext/` with a valid `manifest.json` and `ui/index.html`, **When** the application loads, **Then** the extension appears as a selectable panel option in the panel picker.
2. **Given** the user selects the extension panel from the picker, **When** the panel opens, **Then** the extension's `ui/index.html` is rendered inside an iframe in the chosen panel slot (left or right).
3. **Given** multiple extensions exist in the `extensions/` directory, **When** the application loads, **Then** all valid extensions appear in the panel picker and each can be opened independently.
4. **Given** an extension folder has a malformed or missing manifest, **When** the application loads, **Then** the extension is silently skipped and other extensions load normally.

---

### User Story 2 - Host ↔ Extension Communication via postMessage Bridge (Priority: P2)

The extension iframe communicates with the host application through a structured postMessage protocol. The host can forward board commands into the extension (e.g., when an agent skill fires), and the extension can send messages back to the host (e.g., to trigger a board command or deliver a user comment to the session). This bridge is the generic communication layer that all extensions use.

**Why this priority**: Without bidirectional communication, extensions are just static pages. This bridge enables extensions to react to agent actions and to push user interactions back to the session — making extensions interactive and useful.

**Independent Test**: Create an extension with a button. Clicking the button sends a postMessage to the host requesting `show_panel files`. Verify the files panel opens. Then send a board command from a skill targeting the extension and verify the extension iframe receives it.

**Acceptance Scenarios**:

1. **Given** an extension iframe is loaded, **When** the host receives a board command whose type matches one declared in the extension's manifest, **Then** the host forwards the command payload to the iframe via `window.postMessage`.
2. **Given** the extension sends a postMessage with `{ type: 'board-command', command: 'show_panel', params: { panel: 'files' } }`, **When** the host receives this message, **Then** it executes the board command as if it came from a skill.
3. **Given** the extension sends a postMessage with `{ type: 'send-comment', text: '...', context: {...} }`, **When** the host receives this message, **Then** the comment is delivered to the session's terminal as user input (same mechanism as existing comment delivery).
4. **Given** the postMessage has an unrecognized type or malformed payload, **When** the host receives it, **Then** the message is ignored silently.

---

### User Story 3 - Auto-Generated Extension Skills (Priority: P3)

Every extension that has a UI panel automatically receives three built-in skills, generated at registration time with the extension name as a prefix. These skills require no declaration in the manifest — they are created by the extension system itself. Extensions can additionally declare custom skills in their manifest; both auto-skills and custom skills coexist.

The three auto-generated skills per extension are:

1. **`/<ext-name>.open`** — Opens the extension's panel tab in the IDE. The agent calls this to make the extension visible to the user.
2. **`/<ext-name>.comment`** — Agent-prompted feedback. The agent calls this skill to ask the user for feedback on a specific screen or area. It opens the extension tab, navigates to the specified screen (if applicable), and enables inspect mode so the user can select an element and comment.
3. **`/<ext-name>.select-text`** — User-initiated text feedback. When the user selects/highlights text in the extension iframe, they can send it as a comment with context (screen name, selected text, optional user note).

**Why this priority**: Auto-skills give every extension a baseline of agent interactivity for free. The extension developer doesn't need to write boilerplate skills for common actions like "open this panel" or "ask the user for feedback." This makes extensions immediately useful to the agent.

**Independent Test**: Load the Frontend Design extension. Verify that `frontend-design.open`, `frontend-design.comment`, and `frontend-design.select-text` skill files are auto-created in `.claude-skills/skills/`. Call `frontend-design.open` from a session and verify the extension panel opens. Call `frontend-design.comment` with a screen name and verify inspect mode activates.

**Acceptance Scenarios**:

1. **Given** an extension with a panel is loaded, **When** skill registration runs, **Then** three auto-generated skill files (`<ext-name>.open`, `<ext-name>.comment`, `<ext-name>.select-text`) are created in `.claude-skills/skills/`.
2. **Given** the agent calls `/<ext-name>.open`, **When** the board command is delivered, **Then** the extension panel opens in the IDE (same as selecting it from the panel picker).
3. **Given** the agent calls `/<ext-name>.comment` with a screen parameter, **When** the board command is delivered, **Then** the extension tab opens, navigates to the specified screen, and enables inspect mode for the user to comment.
4. **Given** the user selects text in the extension iframe, **When** they trigger the send action, **Then** the selected text is sent as a comment with context (extension name, screen name, selected text, optional user note).
5. **Given** an extension declares custom skills in its manifest alongside auto-skills, **When** registration runs, **Then** both the auto-generated skills and the custom skills are available to the agent.
6. **Given** an extension has no panel (skill-only), **When** registration runs, **Then** no auto-skills are generated (auto-skills require a panel to target).

---

### User Story 4 - Extension Custom Skills Registration (Priority: P4)

An extension can optionally declare additional custom skill directories in its manifest. These skills are registered alongside the auto-generated skills and become available to the agent. Custom skills follow the same convention as existing skills (SKILL.md + shell scripts).

**Why this priority**: Custom skills enable extension-specific agent capabilities beyond the three auto-skills. For example, the Frontend Design extension needs custom skills like `/design.add-screen` that are unique to its functionality.

**Independent Test**: Create an extension with a custom skill that posts a board command. Run the skill from a session. Verify the board command reaches the extension iframe.

**Acceptance Scenarios**:

1. **Given** an extension manifest lists custom skills (e.g., `"skills": ["skills/my-action"]`), **When** the application loads, **Then** the skill files are accessible to the agent via the standard `.claude-skills/skills/` directory.
2. **Given** an extension custom skill is registered, **When** the agent lists or searches for available skills, **Then** the extension skill appears alongside built-in skills and auto-generated skills.
3. **Given** an extension is removed from the `extensions/` directory, **When** the application reloads, **Then** both the auto-generated and custom skills are no longer available.
4. **Given** an extension custom skill has the same name as a built-in skill, **When** registration occurs, **Then** the built-in skill takes precedence and a warning is logged.

---

### User Story 5 - Frontend Design Extension: Multi-Screen Display (Priority: P5)

The "Frontend Design" test extension allows the agent to generate and display multiple screen designs as HTML. Each screen is added via an agent skill (`/design.add-screen`). The extension renders screens in a tabbed interface so the user can browse between them. This validates the full extension pipeline: skill → board command → postMessage → extension UI update.

**Why this priority**: This is the first real test of the extension system. It validates that skills can push content into extension UI and that users can interact with the results. Without a concrete extension, the system is just infrastructure with no proof it works.

**Independent Test**: Have the agent call `/design.add-screen` three times with different HTML content and screen names. Verify all three tabs appear. Click between tabs and confirm each shows the correct content.

**Acceptance Scenarios**:

1. **Given** the Frontend Design extension is loaded and no screens exist, **When** the user opens the extension panel, **Then** a placeholder "Waiting for designs..." message is displayed.
2. **Given** the agent calls the `/design.add-screen` skill with HTML content and a screen name, **When** the board command reaches the extension, **Then** the screen is rendered and a new tab appears in the screen selector.
3. **Given** multiple screens exist, **When** the user clicks a screen tab, **Then** that screen's HTML content is displayed in the extension panel.
4. **Given** a screen already exists with a given name, **When** the agent calls `/design.update-screen` with the same name and new HTML, **Then** the screen content is replaced in-place without losing the user's position in the tab bar.
5. **Given** screens exist, **When** the agent calls `/design.remove-screen` with a screen name, **Then** the tab is removed and the next available screen is selected automatically.

---

### User Story 6 - Frontend Design Extension: Element Selection and Commenting (Priority: P6)

Users can enable an inspect mode on the currently displayed screen, hover over elements to see them highlighted, click to select an element, and write a comment about that specific element. Comments are scoped to both the screen and the element. When sent, the comment includes enough context (screen name, element description, comment text) for the agent to understand exactly what the user is referring to. Users can also select/highlight text in the extension and send it as a comment with the selected text as context.

**Why this priority**: Per-element commenting and text selection on specific screens is the core value of the Frontend Design extension. It turns a passive screen viewer into an interactive review tool where users can give precise, contextual feedback.

**Independent Test**: Display a screen with a button and a heading. Enable inspect mode, hover over the button (confirm highlight), click it, type "Make this larger", and send. Verify the comment is delivered to the session with context like: `[Screen: Homepage] [Element: button "Submit"] Make this larger`. Also test selecting text and sending it as a comment.

**Acceptance Scenarios**:

1. **Given** a screen is displayed, **When** the user enables inspect mode (via a toolbar toggle), **Then** hovering over elements highlights them with a colored overlay border.
2. **Given** inspect mode is active, **When** the user clicks on a highlighted element, **Then** a comment input popover appears anchored to that element.
3. **Given** the user types a comment and clicks send, **When** the comment is delivered, **Then** it is sent to the session terminal with structured context: screen name, element description (tag, text content, role), and the comment text.
4. **Given** a comment has been placed on an element, **When** the user views that screen, **Then** a visual pin/badge appears on the commented element indicating a comment exists.
5. **Given** comments exist on multiple elements across multiple screens, **When** the user switches between screens, **Then** only the comments for the current screen are displayed.
6. **Given** the agent updates a screen and a previously commented element no longer exists, **When** the user views that screen, **Then** the comment is marked as "stale" with a visual indicator but the comment text is preserved.
7. **Given** the user selects/highlights text in the extension iframe, **When** they trigger the send action, **Then** the selected text is sent as a comment with context: extension name, screen name, selected text, and optional user note.

---

### User Story 7 - In-Session Skill Creation and Refresh (Priority: P7)

The agent can create new extension skills during a Claude Code session by writing skill files (SKILL.md + scripts) directly to the extension's `skills/` directory. No special scaffolding or frontend authoring UI is needed — the agent has filesystem access and follows the established convention. After the agent creates or modifies skills, the user clicks a "Refresh Skills" button in the UI to re-run the registration script, making the new skills immediately available without a restart.

**Why this priority**: This enables iterative extension development. A developer working in a Claude Code session can ask the agent to create custom skills for their extension on the fly, test them immediately, and refine them — all without leaving the session or restarting the dev server.

**Independent Test**: In a Claude Code session, ask the agent to create a new skill for the hello-world extension (e.g., `hello-world.greet`). After the agent writes the files, click "Refresh Skills" in the UI. Verify the new skill appears in the agent's available skills and can be invoked.

**Acceptance Scenarios**:

1. **Given** the agent is working in a Claude Code session, **When** asked to create a skill for an extension, **Then** the agent writes a SKILL.md file and script(s) to the extension's `skills/` directory following the established convention.
2. **Given** the agent has created new skill files, **When** the user clicks the "Refresh Skills" button in the UI, **Then** the `register-extensions` script runs, symlinks the new skills into `.claude-skills/skills/`, and the skills become available to the agent.
3. **Given** the "Refresh Skills" button is clicked, **When** the registration script completes, **Then** a brief success/failure indicator appears (e.g., toast or inline status) showing how many skills were registered.
4. **Given** no extensions or skills have changed, **When** the user clicks "Refresh Skills", **Then** the script runs as a no-op and reports no changes — no errors, no disruption.

---

### Edge Cases

- What happens when an extension's iframe fails to load (broken HTML, missing file)? The panel shows an error state with the extension name and a retry button.
- What happens when two extensions declare the same display name? Both load, but the second one gets a disambiguated label (e.g., "My Extension (2)").
- What happens when extension skill names conflict with built-in skills? Built-in skills take precedence; extension skill is skipped with a console warning.
- What happens when an auto-generated skill name conflicts with a custom skill name? The auto-generated skill takes precedence; the custom skill is skipped with a warning.
- What happens when the extension iframe sends malformed postMessage data? The host ignores it silently — no crash, no error propagation.
- What happens when a screen's HTML contains scripts that try to access the parent frame? The iframe sandbox prevents access to the host — scripts run in isolation.
- What happens when the user comments on an element that the agent subsequently removes? The comment is marked "stale" with a visual indicator, and the text is preserved for context.
- What happens when an extension has skills but no UI panel? The custom skills are registered normally, but no auto-skills are generated (auto-skills require a panel to target).
- What happens when the user selects text that spans multiple elements? The selected text is sent as-is with the context of the nearest parent element.
- What happens when the `extensions/index.json` is missing or unreachable? The extension system gracefully degrades — no extensions are loaded, built-in panels work normally, and a console warning is logged.
- What happens when an extension iframe tries to access `window.parent` or `document.cookie`? The `sandbox="allow-scripts"` attribute blocks all cross-origin access. The iframe script fails silently with a security error.
- What happens when the agent creates a skill file with invalid structure? The register script skips it with a console warning; other skills register normally.
- What happens when the user clicks "Refresh Skills" while the register script is already running? The button is disabled during execution to prevent concurrent runs.
- What happens when the register script fails (e.g., permission error)? The UI shows an error indicator with the failure message; previously registered skills remain unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST discover extensions dynamically via a runtime API endpoint (`GET /api/extensions`) that scans the `extensions/` directory for subfolders containing a `manifest.json` file. No rebuild is required when extensions are added or removed.
- **FR-002**: System MUST render extension UI in an iframe panel, loaded from the extension's declared HTML entry point.
- **FR-003**: System MUST add extension panels to the panel picker alongside built-in panels, using the display name and icon from the manifest.
- **FR-004**: System MUST support bidirectional communication between the host app and extension iframes via a structured postMessage protocol.
- **FR-005**: System MUST forward board commands whose type matches an extension's declared `boardCommands` from the WebSocket to the extension iframe via postMessage.
- **FR-006**: System MUST allow extension iframes to trigger board commands and deliver comments to the session via postMessage to the host.
- **FR-007**: System MUST auto-generate three skills for every extension with a panel: `<ext-name>.open`, `<ext-name>.comment`, `<ext-name>.select-text`. These are created at registration time as real SKILL.md + script files.
- **FR-008**: The `<ext-name>.open` auto-skill MUST open the extension's panel tab in the IDE via a board command.
- **FR-009**: The `<ext-name>.comment` auto-skill MUST open the extension tab, navigate to a specified screen (if applicable), and enable inspect mode so the user can select an element and comment.
- **FR-010**: The `<ext-name>.select-text` auto-skill MUST enable the user to select text in the extension iframe and send it as a comment with context (extension name, screen name, selected text, optional user note).
- **FR-011**: System MUST support extensions declaring additional custom skills in their manifest alongside auto-generated skills. Both coexist.
- **FR-012**: System MUST auto-register both auto-generated and custom extension skills by making their files accessible in the standard `.claude-skills/skills/` directory.
- **FR-013**: System MUST isolate extension iframes so that errors in one extension do not affect the host application or other extensions.
- **FR-014**: System MUST define a structured manifest format declaring: name, displayName, panel (entry point, default position, icon), skills list, and boardCommands list.
- **FR-015**: System MUST support extensions that have only custom skills (no UI, no auto-skills) or only UI (no custom skills, but auto-skills are still generated).
- **FR-016**: System MUST NOT require any backend server code changes to add, remove, or update extensions. Extension loading, rendering, and communication MUST be entirely frontend-driven.
- **FR-017**: The Frontend Design extension MUST render multiple named HTML screens in a tabbed interface.
- **FR-018**: The Frontend Design extension MUST support element inspection with hover highlighting and click-to-select.
- **FR-019**: The Frontend Design extension MUST support per-element, per-screen commenting with structured context delivery to the session.
- **FR-020**: The Frontend Design extension MUST support text selection and sending selected text as a comment with context.
- **FR-021**: The Frontend Design extension MUST receive screen content and updates from agent skills via the postMessage bridge.
- **FR-022**: System MUST provide a "Refresh Skills" button in the UI that triggers the `register-extensions` script to re-discover and register new or changed extension skills without requiring a dev server restart.
- **FR-023**: The "Refresh Skills" button MUST show a brief success/failure indicator after the registration script completes, including the count of skills registered or an error message.
- **FR-024**: The "Refresh Skills" button MUST be disabled while the registration script is running to prevent concurrent executions.
- **FR-025**: Extensions MUST be globally available (served dynamically from `extensions/` at runtime) but per-session opt-in. No extensions are enabled by default for a session.
- **FR-026**: System MUST provide a toolbar dropdown/popover in each session where the user checks/unchecks available extensions. Only enabled extensions appear as panel toggle buttons.
- **FR-027**: Per-session extension selection MUST persist across page refreshes, stored in the existing `panel_states` SQLite table as part of the per-session JSON blob.
- **FR-028**: System MUST provide an "Install Extension" UI action that copies an extension folder from a given local path into the global `extensions/` directory, making it available to all sessions.
- **FR-029**: The "Refresh Skills" button MUST work while a session is active — re-registering skills on disk and notifying the running session so newly registered skills become available without restarting the session.

### Key Entities

- **Extension**: A self-contained package in the `extensions/` directory containing a manifest, optional UI files, and optional skill definitions.
- **Extension Manifest**: A JSON file (`manifest.json`) declaring the extension's metadata, panel configuration, custom skill paths, and supported board commands.
- **Extension Panel**: An iframe rendered in the IDE panel area, loaded from the extension's HTML entry point, communicating via postMessage.
- **Auto-Skill**: One of three automatically generated skills (`open`, `comment`, `select-text`) created for every extension that has a panel. Named `<ext-name>.<action>`.
- **Custom Skill**: An extension-declared skill defined in the manifest's `skills` array, following the standard SKILL.md + scripts convention.
- **postMessage Bridge**: The bidirectional communication layer between the host application and extension iframes, carrying board commands and user interactions.
- **Screen** (Frontend Design): A named HTML design rendered inside the extension, selectable via tabs, with its own set of element comments.
- **Element Comment** (Frontend Design): A comment anchored to a specific DOM element on a specific screen, carrying context (screen name, element description, comment text) for the agent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new extension can be added by creating a folder with a manifest and UI files — zero changes to core application code, zero backend modifications.
- **SC-002**: Extension panels load and render their content within 1 second of being selected.
- **SC-003**: Board commands from agent skills reach the extension iframe and trigger UI updates within 500ms.
- **SC-004**: The Frontend Design extension supports at least 10 concurrent screens without visible performance degradation.
- **SC-005**: Users can place element-specific comments on any visible element, and the comment reaches the agent with full context (screen name, element description, comment text) within 1 second of clicking send.
- **SC-006**: All existing functionality (built-in panels, skills, board commands, session management) works unchanged after the extension system is added — zero regressions.
- **SC-007**: A developer can create a new working extension (manifest + simple UI + one skill) in under 30 minutes, using the Frontend Design extension as a reference.
- **SC-008**: Every extension with a panel automatically has 3 working skills (open, comment, select-text) without the extension developer writing any skill files.
- **SC-009**: After the agent creates new skill files in a session, clicking "Refresh Skills" makes them available to the agent within 5 seconds — no dev server restart required.

## Assumptions

- Extensions are trusted first-party code — they are served locally from the project directory, not from untrusted third-party sources. Full cross-origin sandboxing is not required for the initial implementation.
- The `extensions/` directory lives inside the `frontend/` directory (or is aliased into it) so that Vite can serve extension files as static assets without backend changes.
- Extension skills (both auto-generated and custom) follow the same convention as existing skills: a `SKILL.md` file and a `scripts/` directory with shell scripts.
- The Frontend Design extension renders user-provided HTML in a sandboxed iframe (or shadow DOM) within the extension panel to prevent style and script leakage between screens and the host application.
- Comment delivery to the session uses the existing comment mechanism (delivering text to the terminal) — no new backend endpoint is needed.
- Auto-skills are only generated for extensions that have a panel. Skill-only extensions (no UI) do not receive auto-skills since there is no panel to open or inspect.
