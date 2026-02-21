# Tasks: Extension System

**Input**: Design documents from `/specs/012-extension-system/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Extension files: `extensions/` at repository root
- Skills: `.claude-skills/skills/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the foundational types, Vite plugin, and test fixtures needed by all user stories.

- [x] T001 Create extension TypeScript types (ExtensionManifest, LoadedExtension, PostMessagePayload, HostToExtensionMessage, ExtensionToHostMessage) in `frontend/src/services/extension-types.ts` per data-model.md interfaces
- [x] T002 Create Vite plugin for serving extension static files in `frontend/vite-plugin-extensions.ts` — in dev mode: serve `/extensions/*` from `../extensions/`; at build time: copy `extensions/*/ui/` to `dist/extensions/*/ui/`; on both dev start and build: scan `extensions/*/manifest.json` and generate `extensions/index.json` listing all valid extension names (per research.md R1; solves browser directory enumeration)
- [x] T003 [P] Update `frontend/vite.config.ts` to import and register the extensions Vite plugin
- [x] T004 [P] Create minimal hello-world test extension for development/testing in `extensions/hello-world/manifest.json` and `extensions/hello-world/ui/index.html` — the HTML should display "Hello from Extension" and send a `ready` postMessage on load

**Checkpoint**: Vite serves extension files; types are defined; hello-world extension exists for testing.

---

## Phase 2: User Story 1 — Extension Discovery and Panel Display (Priority: P1) — MVP

**Goal**: Extensions are discovered from the `extensions/` directory, appear in the panel picker, and render their UI in an iframe when selected.

**Independent Test**: Open the panel picker, select "Hello World" extension, confirm the iframe renders "Hello from Extension" in the chosen panel slot.

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T005 [P] [US1] Unit test for extension-loader: manifest parsing, validation (valid, malformed, missing fields, name mismatch) in `frontend/tests/unit/extension-loader.test.ts`
- [x] T006 [P] [US1] Unit test for useExtensions hook: discovery returns loaded extensions, skips invalid manifests in `frontend/tests/unit/useExtensions.test.ts`

### Implementation for User Story 1

- [x] T007 [US1] Implement extension-loader service in `frontend/src/services/extension-loader.ts` — `loadExtensions()` fetches `/extensions/index.json` to get the list of available extensions, then fetches each extension's `manifest.json`; validates each manifest per data-model.md rules (name match, alphanumeric+hyphens, required fields), returns `LoadedExtension[]`; logs `console.warn` for invalid manifests and `console.debug` for successful loads; gracefully returns empty array if `index.json` is missing
- [x] T008 [US1] Implement useExtensions hook in `frontend/src/hooks/useExtensions.ts` — calls `loadExtensions()` on mount, stores `LoadedExtension[]` in state, provides `getExtension(name)` helper; memoize the extension list
- [x] T009 [US1] Extend PanelContent type in `frontend/src/hooks/usePanel.ts` — change `PanelContent` from a strict union to `'none' | 'files' | 'git' | 'preview' | 'claude' | 'search' | 'issues' | \`ext:${string}\`` to support dynamic extension panel keys (per research.md R2)
- [x] T010 [US1] Create ExtensionPanel component in `frontend/src/components/ExtensionPanel.tsx` — renders an iframe loading the extension's `panelUrl`, handles iframe load/error states (show error with retry button on failure), sets `sandbox="allow-scripts"` attribute (MUST verify in unit test that rendered iframe has sandbox attribute with only `allow-scripts` — no `allow-same-origin`)
- [x] T011 [US1] Update `renderPanelContent()` in `frontend/src/components/SessionCard.tsx` — add `else if (contentType.startsWith('ext:'))` branch that extracts the extension name, looks it up from the extensions list, and renders `<ExtensionPanel>` with the matched extension's URL
- [x] T012 [US1] Update panel picker dropdown in `frontend/src/components/SessionCard.tsx` — add extension entries to the panel type selector, using `displayName` and `icon` from each loaded extension's manifest; clicking selects `ext:<name>` as the panel content type
- [x] T013 [US1] Wire useExtensions hook into SessionCard — call `useExtensions()` at the SessionCard level and pass the extensions list to both the panel picker and `renderPanelContent()`

**Checkpoint**: Hello-world extension appears in panel picker and renders in iframe. Invalid extensions are silently skipped.

---

## Phase 3: User Story 2 — Host ↔ Extension Communication via postMessage Bridge (Priority: P2)

**Goal**: Extension iframes can communicate bidirectionally with the host via a structured postMessage protocol. The host forwards board commands to extensions and extensions can trigger board commands and deliver comments.

**Independent Test**: The hello-world extension sends a `ready` message → host replies with `init`. Extension button sends `board-command show_panel files` → files panel opens. A skill posts a board command targeting the extension → extension receives it.

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T014 [P] [US2] Unit test for usePostMessageBridge hook: init/ready handshake, message forwarding, malformed message rejection, source validation in `frontend/tests/unit/postmessage-bridge.test.ts`

### Implementation for User Story 2

- [x] T015 [US2] Implement usePostMessageBridge hook in `frontend/src/hooks/usePostMessageBridge.ts` — manages postMessage listener lifecycle; validates `event.source` matches iframe ref; dispatches inbound messages by `type` (`ready` → send `init`; `board-command` → callback; `send-comment` → callback); provides `sendToExtension(message)` method for host→iframe communication; logs `console.debug` for all valid messages and `console.warn` for malformed/rejected messages (NOTE: postMessage uses kebab-case `board-command`, WebSocket uses snake_case `board_command`)
- [x] T016 [US2] Wire postMessage bridge into ExtensionPanel in `frontend/src/components/ExtensionPanel.tsx` — use `usePostMessageBridge` with the iframe ref; on `ready` → send `init` with sessionId and extensionName; expose `sendToExtension` for parent to forward board commands
- [x] T017 [US2] Handle inbound board commands for extensions in `frontend/src/components/SessionCard.tsx` — in the `handleWsMessage` callback, when a `board_command` message arrives and the command type matches any loaded extension's `boardCommands` list, forward the command to that extension's iframe via `sendToExtension({ type: 'board-command', command, params })`
- [x] T018 [US2] Handle outbound extension messages in `frontend/src/components/SessionCard.tsx` — when an extension iframe sends `{ type: 'board-command' }`, execute it via the existing board command handler (`ensurePanelOpen`, `addFileTab`, etc.); when it sends `{ type: 'send-comment' }`, call the existing `comments.create()` + `comments.deliverOne()` API with formatted text including context
- [x] T019 [US2] Update hello-world extension `extensions/hello-world/ui/index.html` — add a "Show Files" button that sends `{ type: 'board-command', command: 'show_panel', params: { panel: 'files' } }` via postMessage; display received board commands in a log area; add `boardCommands` to manifest.json

**Checkpoint**: Full bidirectional communication works. Extension receives init, can trigger board commands, and deliver comments to the session.

---

## Phase 4: User Story 3 — Auto-Generated Extension Skills (Priority: P3)

**Goal**: Every extension with a panel automatically gets three skills (`<ext-name>.open`, `<ext-name>.comment`, `<ext-name>.select-text`) generated at registration time. The agent discovers and calls them naturally.

**Independent Test**: After loading hello-world extension, verify `hello-world.open`, `hello-world.comment`, `hello-world.select-text` exist in `.claude-skills/skills/`. Call `hello-world.open` from a session terminal and verify the extension panel opens.

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T020 [P] [US3] Unit test for auto-skill-generator: generates 3 skill directories per extension with panel, skips extensions without panel, generates correct SKILL.md content and shell scripts in `tests/unit/auto-skill-generator.test.ts` (root tests/ directory since this is a Node script, not a frontend module)

### Implementation for User Story 3

- [x] T021 [US3] Implement auto-skill-generator as a Node script in `scripts/auto-skill-generator.ts` — for each extension with a panel (reads manifests from `extensions/*/manifest.json`), generates SKILL.md + shell script for `<ext-name>.open`, `<ext-name>.comment`, `<ext-name>.select-text` in `.claude-skills/skills/`; the `.open` script posts a board command `show_panel` with `panel=ext:<name>`; the `.comment` script posts a board command `ext.comment` with `extension=<name>` and optional `screen` param; the `.select-text` script posts a board command `ext.select_text` with `extension=<name>` (NOTE: this is a Node build-time script, NOT a frontend module — it writes files to disk)
- [x] T022 [US3] Create `scripts/register-extension-skills.js` Node script at project root — imports `scripts/auto-skill-generator.ts`, reads all `extensions/*/manifest.json`, calls auto-skill-generator to create auto-skill files in `.claude-skills/skills/<ext-name>.open/`, `.claude-skills/skills/<ext-name>.comment/`, `.claude-skills/skills/<ext-name>.select-text/`; logs each skill creation at `console.info` level; does NOT symlink custom skills yet (that's US4)
- [x] T023 [US3] Add `register-extensions` npm script to root `package.json` — runs `node scripts/register-extension-skills.js`
- [x] T024 [US3] Handle auto-skill board commands in `frontend/src/components/SessionCard.tsx` — when `ext.comment` board command arrives, open the extension tab, and send a `{ type: 'board-command', command: 'enable-inspect', params: { screen } }` postMessage to the extension iframe; when `ext.select_text` arrives, open the extension tab and send `{ type: 'board-command', command: 'enable-text-select' }` to the iframe
- [x] T025 [US3] Implement text selection detection in ExtensionPanel — listen for `{ type: 'send-comment' }` messages that contain `context.selectedText`; format and deliver via existing comment API with context: `[Extension: <name>] Selected text: "<text>"\nComment: <user note>`

**Checkpoint**: Auto-skills are generated for every extension with a panel. Agent can call `.open` to show extension, `.comment` to prompt user feedback.

---

## Phase 5: User Story 4 — Extension Custom Skills Registration (Priority: P4)

**Goal**: Extensions can declare custom skills in their manifest. These are symlinked to `.claude-skills/skills/` alongside auto-generated skills. Conflict resolution: built-in > auto > custom.

**Independent Test**: Create an extension with a custom skill. Run `npm run register-extensions`. Verify the custom skill symlink exists in `.claude-skills/skills/`. Verify built-in skills are not overwritten by conflicting extension skills.

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [x] T026 [P] [US4] Unit test for custom skill registration: symlink creation, conflict detection (built-in precedence, auto-skill precedence), cleanup of stale symlinks in `frontend/tests/unit/extension-loader.test.ts` (extend existing)

### Implementation for User Story 4

- [x] T027 [US4] Extend `scripts/register-extension-skills.js` — after generating auto-skills, also read `skills` array from each manifest and create symlinks: `.claude-skills/skills/<skill-name> → extensions/<ext-name>/skills/<skill-name>`; check for conflicts with built-in skills (skip with console.warn) and auto-skills (skip with console.warn)
- [x] T028 [US4] Add cleanup logic to `scripts/register-extension-skills.js` — before registering, scan `.claude-skills/skills/` for symlinks pointing into `extensions/` that no longer have a corresponding extension/manifest entry; remove stale symlinks
- [x] T029 [US4] Add `predev` and `prebuild` npm scripts to root `package.json` that run `register-extensions` automatically so skills are always in sync

**Checkpoint**: Custom skills from manifest are registered via symlinks. Stale skills are cleaned up. Conflicts are resolved with correct precedence.

---

## Phase 6: User Story 5 — Frontend Design Extension: Multi-Screen Display (Priority: P5)

**Goal**: The Frontend Design test extension renders agent-generated HTML screens in a tabbed interface. Screens are added/updated/removed via custom skills that post board commands.

**Independent Test**: Call `/design.add-screen` three times with different HTML and screen names. Verify three tabs appear. Switch between tabs. Call `/design.update-screen` on one screen. Call `/design.remove-screen` on another.

### Tests for User Story 5 (MANDATORY per Constitution Principle I)

- [x] T030 [P] [US5] Unit test for frontend-design extension screen management: add/update/remove screens, tab switching, placeholder state, duplicate name handling in `frontend/tests/unit/design-extension.test.ts`

### Implementation for User Story 5

- [x] T031 [US5] Create Frontend Design extension manifest in `extensions/frontend-design/manifest.json` — name: `frontend-design`, displayName: `Frontend Design`, panel entry: `ui/index.html`, defaultPosition: `right`, icon: `layout`, skills: `[design-add-screen, design-update-screen, design-remove-screen]`, boardCommands: `[design.add_screen, design.update_screen, design.remove_screen]`
- [x] T032 [US5] Create Frontend Design extension `extensions/frontend-design/ui/index.html` — entry point HTML file that loads app.js and styles.css; contains a tab bar container, a screen viewport container, and a toolbar area; sends `ready` postMessage on load
- [x] T033 [US5] Create Frontend Design extension `extensions/frontend-design/ui/styles.css` — dark theme matching the IDE (bg: #1e1e2e, text: #cdd6f4), tab bar styling, active tab indicator, screen viewport with full-width sandboxed iframe, placeholder state styling, toolbar styling
- [x] T034 [US5] Create Frontend Design extension `extensions/frontend-design/ui/app.js` — screen state management (array of `{ name, html, updatedAt }`); postMessage listener handles `board-command` messages for `design.add_screen` (add tab + render), `design.update_screen` (replace HTML), `design.remove_screen` (remove tab + select next); renders screens as `<iframe srcdoc="...">` with `sandbox="allow-scripts"` (per research.md R5); tab click switches active screen; shows "Waiting for designs..." placeholder when no screens exist
- [x] T035 [P] [US5] Create `/design.add-screen` skill in `extensions/frontend-design/skills/design-add-screen/` — SKILL.md describes usage (`./scripts/design-add-screen.sh <name> <html>`); shell script POSTs board command `design.add_screen` with `name` and `html` params to `http://localhost:${C3_HUB_PORT}/api/sessions/${C3_SESSION_ID}/board-command`
- [x] T036 [P] [US5] Create `/design.update-screen` skill in `extensions/frontend-design/skills/design-update-screen/` — same pattern as add-screen but command is `design.update_screen`
- [x] T037 [P] [US5] Create `/design.remove-screen` skill in `extensions/frontend-design/skills/design-remove-screen/` — same pattern, command is `design.remove_screen`, only needs `name` param

**Checkpoint**: Frontend Design extension shows tabbed screen viewer. Agent skills can add/update/remove screens. Screens render in sandboxed iframes.

---

## Phase 7: User Story 6 — Frontend Design Extension: Element Selection and Commenting (Priority: P6)

**Goal**: Users can inspect elements on screens, add per-element comments, see comment pins, and select text to send as feedback. Comments are delivered to the session with structured context.

**Independent Test**: Display a screen with a button. Enable inspect mode, hover (confirm highlight), click button, type comment, send. Verify comment delivered as `[Design Review — Screen: "X"] Element: [button] "Y"\nComment: Z`. Select text, send, verify text context included.

### Tests for User Story 6 (MANDATORY per Constitution Principle I)

- [x] T038 [P] [US6] Unit test for element inspection and commenting: element targeting from coordinates, element description generation, comment pin placement, stale detection, text selection context formatting in `frontend/tests/unit/design-extension.test.ts` (extend existing)

### Implementation for User Story 6

- [x] T039 [US6] Add inspect mode overlay to `extensions/frontend-design/ui/app.js` — toolbar toggle button enables inspect mode; an overlay div sits above the active screen iframe with `pointer-events: all`; on mousemove, translate overlay coordinates to iframe contentDocument coordinates via `elementFromPoint()`; draw a highlight box (colored border) over the hovered element; on click, capture the element's tagName, textContent (truncated), and ARIA role
- [x] T040 [US6] Add comment popover to `extensions/frontend-design/ui/app.js` — on element click in inspect mode, show a positioned comment input (textarea + send button) anchored near the clicked element; on send, construct `{ type: 'send-comment', text, context: { source: 'frontend-design', screen: activeScreenName, element: '[tagName] "text" (role: role)' } }` and postMessage to host
- [x] T041 [US6] Add comment pins/badges to `extensions/frontend-design/ui/app.js` — maintain a local array of placed comments per screen (name, elementSelector, rect, text, stale); render small numbered badges on the overlay at each comment's saved rect position; clicking a badge shows the comment text
- [x] T042 [US6] Add stale comment detection to `extensions/frontend-design/ui/app.js` — when a screen's HTML is updated via `design.update_screen`, re-query each comment's element selector against the new contentDocument; if the element no longer exists, mark the comment as stale (visual indicator: dashed border, faded badge)
- [x] T043 [US6] Add text selection feedback to `extensions/frontend-design/ui/app.js` — listen for `mouseup` events on the screen iframe's contentDocument; if text is selected (`window.getSelection().toString()`), show a floating "Send Selection" button; on click, construct `{ type: 'send-comment', text: userNote, context: { source: 'frontend-design', screen: activeScreenName, selectedText: selectedText } }` and postMessage to host
- [x] T044 [US6] Handle `enable-inspect` and `enable-text-select` board commands in `extensions/frontend-design/ui/app.js` — when the host sends these commands (from the auto-skills), activate inspect mode or text selection mode respectively; if a `screen` param is provided, switch to that screen tab first

**Checkpoint**: Full element inspection, commenting, text selection, and stale detection work. Comments reach the agent with structured context.

---

## Phase 8: System Tests (MANDATORY per Constitution Principle I)

**Purpose**: End-to-end system tests verifying the extension system works as an integrated whole. These complement the unit tests in each user story phase.

- [x] T045 [P] System test: extension discovery and panel rendering in `frontend/tests/system/extension-system.test.ts` — load the hello-world extension fixture, verify it appears in panel picker, verify iframe renders with correct src, verify `sandbox="allow-scripts"` is set (no `allow-same-origin`), verify malformed extensions are skipped
- [x] T046 [P] System test: postMessage bridge round-trip in `frontend/tests/system/extension-system.test.ts` — load extension, simulate `ready` postMessage from iframe, verify host sends `init` back; simulate `board-command` postMessage from iframe, verify host executes it; send a board command to extension via host, verify iframe receives it
- [x] T047 [P] System test: auto-skill generation and registration in `tests/system/extension-skills.test.ts` — run `register-extension-skills.js` with a test extension fixture, verify 3 auto-skill directories are created with correct SKILL.md and executable shell scripts, verify custom skill symlinks are created, verify stale symlinks are cleaned up
- [x] T048 System test: Frontend Design extension end-to-end in `frontend/tests/system/design-extension.test.ts` — simulate `design.add_screen` board command with HTML, verify screen tab appears, verify HTML renders in sandboxed srcdoc iframe; simulate inspect mode activation, verify element selection and comment delivery format

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, regression verification, and merge.

- [x] T049 [P] Add iframe load error handling in `frontend/src/components/ExtensionPanel.tsx` — on iframe `onerror` or load timeout (5s), show error state with extension name and "Retry" button; log `console.warn` with extension name and error details
- [x] T050 [P] Add duplicate display name disambiguation in `frontend/src/services/extension-loader.ts` — if two extensions share a displayName, append "(2)" to the second one; log `console.warn` when disambiguation occurs
- [x] T051 Verify all existing tests still pass — run full test suite (`npm test`) and confirm zero regressions (SC-006)
- [x] T052 [P] Remove hello-world test extension from `extensions/hello-world/` (development-only fixture; keep frontend-design as the real test extension)
- [x] T053 Run `npm run register-extensions` and verify frontend-design auto-skills + custom skills are all registered in `.claude-skills/skills/`
- [ ] T054 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: Depends on Setup (Phase 1) — this is the MVP
- **US2 (Phase 3)**: Depends on US1 (needs ExtensionPanel and panel rendering)
- **US3 (Phase 4)**: Depends on US2 (auto-skills need board command delivery to extension)
- **US4 (Phase 5)**: Depends on US3 (extends the registration script)
- **US5 (Phase 6)**: Depends on US2 (needs postMessage bridge for board commands)
- **US6 (Phase 7)**: Depends on US5 (needs screens to inspect/comment on)
- **System Tests (Phase 8)**: Depends on all user stories being complete — validates integration
- **Polish (Phase 9)**: Depends on system tests passing — error handling, cleanup, merge

### User Story Dependencies

```
Phase 1 (Setup)
    │
    ▼
Phase 2 (US1: Panel Display) ─── MVP STOP POINT
    │
    ├───────────────────────┐
    ▼                       ▼
Phase 3 (US2: Bridge)    (can demo US1 here)
    │
    ├───────────┐
    ▼           ▼
Phase 4       Phase 6
(US3: Auto)   (US5: Screens) ─── depends on US2 only
    │           │
    ▼           ▼
Phase 5       Phase 7
(US4: Custom) (US6: Comments) ── depends on US5
    │           │
    └─────┬─────┘
          ▼
    Phase 8 (System Tests) ─── integration validation
          │
          ▼
    Phase 9 (Polish)
```

**Note**: US5 (screens) and US3 (auto-skills) can be developed in parallel after US2 is complete.

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/interfaces before services
- Services before components
- Components before wiring/integration

### Parallel Opportunities

- T003 + T004 (Setup: vite config + hello-world extension)
- T005 + T006 (US1 tests: loader + hook)
- T035 + T036 + T037 (US5: three skill files can be written in parallel)
- T045 + T046 + T047 (System tests: discovery, bridge, skills can run in parallel)
- T049 + T050 + T052 (Polish: independent error handling, disambiguation, cleanup)
- Phase 4 (US3) and Phase 6 (US5) can run in parallel after Phase 3 (US2) completes

---

## Parallel Example: User Story 5

```bash
# Launch all skill files together (different directories):
Task: T035 "Create /design.add-screen skill"
Task: T036 "Create /design.update-screen skill"
Task: T037 "Create /design.remove-screen skill"

# These can also parallel with test writing:
Task: T030 "Unit test for design extension screen management"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T004)
2. Complete Phase 2: US1 — Extension Discovery & Panel Display (T005–T013)
3. **STOP and VALIDATE**: Open panel picker, select hello-world extension, confirm iframe renders
4. Deploy/demo if ready — proves extensions work end-to-end

### Incremental Delivery

1. Setup + US1 → Panel rendering works → Demo (MVP!)
2. Add US2 → Bidirectional communication → Demo (interactive extensions!)
3. Add US3 + US4 → Agent can discover and use extension skills → Demo
4. Add US5 → Frontend Design extension shows screens → Demo
5. Add US6 → Full element commenting and text selection → Demo (feature-complete!)
6. System Tests → End-to-end integration validation
7. Polish → Error handling, cleanup, CI → Merge to main

### Parallel Paths After US2

Once the postMessage bridge (US2) is complete, two parallel workstreams:
- **Path A**: US3 (auto-skills) → US4 (custom skills) — skill infrastructure
- **Path B**: US5 (screens) → US6 (commenting) — Frontend Design extension UI

Both paths merge at Polish (Phase 8).

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Zero backend changes — all tasks are frontend/extension/script files
- The hello-world extension is a development fixture; frontend-design is the deliverable
- Terminology convention: `board_command` (snake_case) in WebSocket/backend; `board-command` (kebab-case) in postMessage protocol
- `auto-skill-generator.ts` lives in `scripts/` (Node script that writes to disk), NOT in `frontend/src/`
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
