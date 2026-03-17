# Tasks: Agent Work Report

**Input**: Design documents from `/specs/040-agent-work-report/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the extension scaffold — manifest, basic file structure, skill directories

- [x] T001 Create extension manifest at `extensions/work-report/manifest.json` declaring name, displayName, panel (entry: `ui/index.html`, position: right, icon: `file-text`), skills paths for all 4 skills, and boardCommands for `report.file_changed`
- [x] T002 [P] Create extension UI entry point at `extensions/work-report/ui/index.html` with minimal HTML shell referencing `styles.css` and `app.js`
- [x] T003 [P] Create extension stylesheet at `extensions/work-report/ui/styles.css` with dark theme base styles matching IDE aesthetic (dark background, light text, consistent spacing)
- [x] T004 [P] Create skill directory structure: `extensions/work-report/skills/report.attach-screenshot/scripts/`, `extensions/work-report/skills/report.attach-video/scripts/`, `extensions/work-report/skills/report.attach-diff/scripts/`, `extensions/work-report/skills/report.export-github/scripts/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extension panel must render and communicate with host before skills can be tested visually

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement extension app logic at `extensions/work-report/ui/app.js`: listen for `init` postMessage from host to receive sessionId, send `ready` message back to host, listen for `board-command` messages (specifically `report.file_changed`), and implement the report fetch-and-render cycle using `/api/sessions/{sessionId}/serve/report.html`
- [x] T006 Implement empty state UI in `extensions/work-report/ui/app.js`: when `report.html` returns 404, show a styled placeholder ("No work report yet — the agent will create one after completing its task") with an icon

**Checkpoint**: Extension loads in panel picker, shows empty state, and receives postMessage init — ready for user story implementation

---

## Phase 3: User Story 1 - Agent Builds a Work Report (Priority: P1) 🎯 MVP

**Goal**: Agent can create an HTML report with attached media, viewable in the extension panel with auto-refresh on changes

**Independent Test**: Create `report.html` in a session directory with `<img>` tags referencing files in `.report-assets/`. Extension panel should render the report and refresh when the file is modified.

### Tests for User Story 1 (MANDATORY per Constitution Principle I) ✅

- [x] T007 [P] [US1] Unit test for `report.attach-screenshot` skill script in `tests/unit/work-report-skills.test.ts`: test that it copies an image file to `.report-assets/` with timestamp prefix, returns correct relative path, rejects non-image files, and handles missing source file
- [x] T008 [P] [US1] Unit test for `report.attach-video` skill script in `tests/unit/work-report-skills.test.ts`: test that it copies video files (webm, mp4) to `.report-assets/` with timestamp prefix, returns correct relative path, rejects invalid file types
- [x] T009 [P] [US1] Unit test for `report.attach-diff` skill script in `tests/unit/work-report-skills.test.ts`: test that it runs `git diff` with provided arguments and outputs diff text to stdout, handles default case (no args = HEAD), handles non-git directory error
- [x] T010 [P] [US1] Integration test for extension loading in `tests/integration/work-report-extension.test.ts`: verify extension manifest is valid, extension appears in `/api/extensions` response, and `report.html` is served correctly via `/api/sessions/:id/serve/report.html`
- [x] T011 [P] [US1] Integration test for file change forwarding in `tests/integration/work-report-extension.test.ts`: verify that when `report.html` changes in the session directory, a `report.file_changed` board command is dispatched to the extension

### Implementation for User Story 1

- [x] T012 [P] [US1] Create `report.attach-screenshot` SKILL.md at `extensions/work-report/skills/report.attach-screenshot/SKILL.md` with frontmatter (name, description), usage docs, parameter descriptions, and examples per contracts/skills-api.md
- [x] T013 [P] [US1] Create `report.attach-screenshot` bash script at `extensions/work-report/skills/report.attach-screenshot/scripts/report.attach-screenshot.sh`: validate source file exists and has image extension (png/jpg/jpeg/gif/webp), create `.report-assets/` directory via `mkdir -p`, copy file with `$(date +%s%N)` prefix, echo relative path to stdout
- [x] T014 [P] [US1] Create `report.attach-video` SKILL.md at `extensions/work-report/skills/report.attach-video/SKILL.md` with frontmatter, usage docs, and examples
- [x] T015 [P] [US1] Create `report.attach-video` bash script at `extensions/work-report/skills/report.attach-video/scripts/report.attach-video.sh`: validate source file exists and has video extension (webm/mp4/mov), create `.report-assets/` directory, copy file with timestamp prefix, echo relative path
- [x] T016 [P] [US1] Create `report.attach-diff` SKILL.md at `extensions/work-report/skills/report.attach-diff/SKILL.md` with frontmatter, usage docs, and examples
- [x] T017 [P] [US1] Create `report.attach-diff` bash script at `extensions/work-report/skills/report.attach-diff/scripts/report.attach-diff.sh`: run `git diff "${@:-HEAD}"` in the session working directory and output to stdout, exit with error if not a git repo
- [x] T018 [US1] Implement report rendering in `extensions/work-report/ui/app.js`: when `report.html` is fetched successfully, render it inside a nested iframe (using `src` attribute pointing to the serve URL) to isolate report CSS/JS from extension chrome; handle relative paths for `.report-assets/` media
- [x] T019 [US1] Add file change forwarding in `frontend/src/components/SessionCard.tsx`: when a `file_changed` WebSocket event includes a path matching `report.html`, send a `report.file_changed` board command to the work-report extension panel via its ref handle
- [x] T020 [US1] Handle `report.file_changed` board command in `extensions/work-report/ui/app.js`: when received, reload the nested iframe src (append cache-busting query param) to refresh the report display

**Checkpoint**: Agent can create `report.html` with attached screenshots/videos, and the extension panel renders and auto-refreshes. Attachment skills work correctly. All US1 tests pass.

---

## Phase 4: User Story 2 - Report Exports to GitHub PR (Priority: P2)

**Goal**: Agent can convert the HTML report to GitHub-compatible markdown with uploaded images and videos

**Independent Test**: Create a report with text and a screenshot, run the export skill, verify output is valid markdown with a GitHub-hosted image URL.

### Tests for User Story 2 (MANDATORY per Constitution Principle I) ✅

- [x] T021 [P] [US2] Unit test for `report.export-github` skill in `tests/unit/work-report-skills.test.ts`: test HTML-to-markdown conversion logic (headings, paragraphs, img tags, pre/code blocks, video tags), test media URL extraction from HTML, test error handling for missing report.html
- [x] T022 [P] [US2] Integration test for GitHub export in `tests/integration/work-report-extension.test.ts`: create a report.html with an image reference, run the export script (with `gh` mocked if unavailable in CI), verify markdown output contains image references and proper formatting

### Implementation for User Story 2

- [x] T023 [P] [US2] Create `report.export-github` SKILL.md at `extensions/work-report/skills/report.export-github/SKILL.md` with frontmatter, usage docs, parameter descriptions (--repo flag), and examples per contracts/skills-api.md
- [x] T024 [US2] Create `report.export-github` bash script at `extensions/work-report/skills/report.export-github/scripts/report.export-github.sh`: read `report.html` from working directory, extract `<img src>` and `<video src>` references, for each local media file upload to GitHub via `gh` CLI (using issue comment upload pattern), convert WebM to mp4 via `ffmpeg` before upload (skip with warning if ffmpeg unavailable), convert HTML to markdown (h1-h6→#, p→text, img→![](url), pre/code→fenced blocks, video→direct URL), output final markdown to stdout
- [x] T025 [US2] Add ffmpeg availability check in export script: if `command -v ffmpeg` fails, emit warning to stderr and skip video conversion (upload WebM as-is or skip video with note)

**Checkpoint**: Export skill produces valid GitHub markdown with uploaded media. Works with text-only reports and gracefully handles missing ffmpeg. All US2 tests pass.

---

## Phase 5: User Story 3 - Session-Scoped Lifecycle (Priority: P3)

**Goal**: Report files and assets are automatically cleaned up when the session ends

**Independent Test**: Create a session, add `report.html` and `.report-assets/` with files, end the session, verify both are deleted from the working directory.

### Tests for User Story 3 (MANDATORY per Constitution Principle I) ✅

- [x] T026 [P] [US3] Integration test for session cleanup in `tests/integration/work-report-extension.test.ts`: create a session with a `report.html` and `.report-assets/` directory containing test files, trigger session completion, verify both the report file and assets directory are removed from the working directory
- [x] T027 [P] [US3] Integration test for cleanup edge cases in `tests/integration/work-report-extension.test.ts`: verify cleanup succeeds when no report exists (no error thrown), verify cleanup succeeds when `.report-assets/` is empty, verify cleanup doesn't affect other session files

### Implementation for User Story 3

- [x] T028 [US3] Add report cleanup to session completion handler in `backend/src/services/session-manager.ts`: when a session transitions to completed/failed/deleted, delete `report.html` and recursively delete `.report-assets/` from `session.workingDirectory` using `fs.rm({ recursive: true, force: true })`; wrap in try/catch to avoid breaking session cleanup if files don't exist
- [x] T029 [US3] Add empty state transition in `extensions/work-report/ui/app.js`: if a fetch of `report.html` that previously succeeded now returns 404 (report was cleaned up), transition back to the empty state UI

**Checkpoint**: Session cleanup removes all report artifacts. No orphaned files remain. All US3 tests pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, test coverage, and CI readiness

- [x] T030 Make all skill scripts executable: `chmod +x extensions/work-report/skills/*/scripts/*.sh`
- [x] T031 Run full test suite: `npm test && npm run lint` — verify all tests pass and no lint errors introduced
- [x] T032 Run quickstart.md manual validation: start dev server, create session, verify extension appears, create report, verify rendering, test attachment skills, test export
- [x] T033 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on T001-T004 (Setup) — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion. Can run in parallel with US1 (export skill is independent of extension rendering), but best done after US1 since the report must exist to export
- **User Story 3 (Phase 5)**: Depends on Phase 2 completion. Independent of US1/US2 (backend cleanup only)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) — Independently testable, but practically benefits from US1 being done first
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) — Fully independent (backend-only change)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- SKILL.md before bash scripts (documentation drives implementation)
- Skills before UI integration (backend before frontend)
- Core implementation before integration with SessionCard

### Parallel Opportunities

- T002, T003, T004 can all run in parallel (different files)
- T007, T008, T009, T010, T011 can all run in parallel (test files)
- T012-T017 can all run in parallel (independent skill files)
- T021, T022 can run in parallel (test files)
- T026, T027 can run in parallel (test files)
- US1 and US3 can run in parallel after Phase 2 (different codebases: extension vs backend)

---

## Parallel Example: User Story 1

```bash
# Launch all US1 tests together:
Task: "Unit test for attach-screenshot skill in tests/unit/work-report-skills.test.ts"
Task: "Unit test for attach-video skill in tests/unit/work-report-skills.test.ts"
Task: "Unit test for attach-diff skill in tests/unit/work-report-skills.test.ts"
Task: "Integration test for extension loading in tests/integration/work-report-extension.test.ts"

# Launch all US1 skill implementations together:
Task: "Create attach-screenshot SKILL.md"
Task: "Create attach-screenshot bash script"
Task: "Create attach-video SKILL.md"
Task: "Create attach-video bash script"
Task: "Create attach-diff SKILL.md"
Task: "Create attach-diff bash script"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T006)
3. Complete Phase 3: User Story 1 (T007-T020)
4. **STOP and VALIDATE**: Test extension rendering, attachment skills, auto-refresh
5. Deploy/demo if ready — agent can already create and view reports

### Incremental Delivery

1. Complete Setup + Foundational → Extension shell ready
2. Add User Story 1 → Test independently → Agent can build and view reports (MVP!)
3. Add User Story 2 → Test independently → Reports export to GitHub PRs
4. Add User Story 3 → Test independently → Cleanup works automatically
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (extension UI + attachment skills)
   - Developer B: User Story 3 (session cleanup — small, backend-only)
3. After US1 is done:
   - Developer A: User Story 2 (export skill — needs report to exist for testing)
4. Polish phase together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- No new npm dependencies required — all tooling exists or uses shell commands (gh, ffmpeg, git)
- Extension follows the exact same pattern as `frontend-design` — use it as reference throughout
