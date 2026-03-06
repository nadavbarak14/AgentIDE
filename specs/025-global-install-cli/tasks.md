# Tasks: Global Install & CLI Commands

**Input**: Design documents from `/specs/025-global-install-cli/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Tests**: Per the project constitution (Principle I: Comprehensive Testing), unit tests and system tests are MANDATORY for all features. Tests MUST use real dependencies — mocks are permitted ONLY when the real dependency is genuinely unavailable.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the `open` dependency and prepare the utility module structure

- [x] T001 Add `open` npm package as a dependency in package.json
- [x] T002 Create `backend/src/utils/` directory if it doesn't exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the dependency checker utility used by postinstall, pre-flight, and doctor command

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Implement platform detection (detect OS, distro, package manager) in `backend/src/utils/dependency-checker.ts` — export `detectPlatform()` returning Platform enum (ubuntu, rhel, macos, windows, unknown) using `process.platform` and `/etc/os-release`
- [x] T004 Implement dependency check logic in `backend/src/utils/dependency-checker.ts` — export `checkDependency(dep: SystemDependency): DependencyCheckResult` using `child_process.execSync` with `which`/`where` and `--version` parsing
- [x] T005 Implement `checkAllDependencies()` in `backend/src/utils/dependency-checker.ts` — define the required dependencies list (tmux, gh, node) with per-platform install instructions, check all, return results array
- [x] T006 Implement `formatDependencyReport(results: DependencyCheckResult[]): string` in `backend/src/utils/dependency-checker.ts` — format colored terminal output showing status of each dependency and install instructions for missing ones
- [x] T007 Write unit tests for dependency checker in `backend/tests/unit/dependency-checker.test.ts` — test platform detection, version parsing, report formatting, and handling of missing binaries (use real `which node` for happy path, fake binary name for missing path)

**Checkpoint**: Dependency checker utility is complete, tested, and ready for use by all user stories

---

## Phase 3: User Story 1 - Install Adyx Globally (Priority: P1) MVP

**Goal**: Global npm install works and checks/reports dependencies automatically via postinstall

**Independent Test**: Run `npm install -g .` from repo root, verify `adyx` command is available globally and postinstall prints dependency status

### Tests for User Story 1 (MANDATORY per Constitution Principle I)

- [x] T008 [US1] Write system test for postinstall script in `backend/tests/system/postinstall.test.ts` — execute `node backend/scripts/postinstall.js` and verify it exits 0, prints dependency status, and prints install instructions for any missing deps

### Implementation for User Story 1

- [x] T009 [US1] Create postinstall script at `backend/scripts/postinstall.js` — plain JS (no TypeScript, no build step needed), import and run the compiled dependency checker, print results with colored output, exit 0 (never fail install on missing deps, just warn)
- [x] T010 [US1] Add `"postinstall": "node backend/scripts/postinstall.js"` to root `package.json` scripts section
- [x] T011 [US1] Verify `"bin": {"adyx": "./backend/dist/cli.js"}` is correct in package.json and `cli.js` has `#!/usr/bin/env node` shebang after build

**Checkpoint**: `npm install -g .` installs adyx globally and prints dependency check results

---

## Phase 4: User Story 2 - Start the Hub Server (Priority: P1)

**Goal**: `adyx start` launches the hub with pre-flight checks and auto-opens browser

**Independent Test**: Run `adyx start` from any directory, verify hub starts, browser opens, and pre-flight warnings shown for missing deps

### Tests for User Story 2 (MANDATORY per Constitution Principle I)

- [x] T012 [US2] Write system test for `adyx start` in `backend/tests/system/cli.test.ts` — spawn `node backend/dist/cli.js start --port 0 --no-open` and verify server starts, outputs URL, and runs pre-flight check

### Implementation for User Story 2

- [x] T013 [US2] Add pre-flight dependency check to `adyx start` in `backend/src/cli.ts` — before calling `startHub()`, run `checkAllDependencies()` and print warnings for missing deps (don't block startup, just warn)
- [x] T014 [US2] Add `--no-open` flag to `adyx start` command in `backend/src/cli.ts` — default is to open browser, `--no-open` disables it
- [x] T015 [US2] Implement browser auto-open in `backend/src/cli.ts` — after `startHub()` resolves with the server URL, call `open(url)` unless `--no-open` is set
- [x] T016 [US2] Ensure `startHub()` in `backend/src/hub-entry.ts` returns the actual URL (host:port) the server is listening on so the CLI can pass it to `open()`

**Checkpoint**: `adyx start` works from any directory, opens browser, shows pre-flight warnings

---

## Phase 5: User Story 3 - Start the Remote Agent (Priority: P1)

**Goal**: `adyx agent` launches the remote agent with pre-flight checks

**Independent Test**: Run `adyx agent --port 4200` and verify agent starts listening

### Tests for User Story 3 (MANDATORY per Constitution Principle I)

- [x] T017 [US3] Write system test for `adyx agent` in `backend/tests/system/cli.test.ts` — spawn `node backend/dist/cli.js agent --port 0` and verify agent starts and outputs listening message

### Implementation for User Story 3

- [x] T018 [US3] Export `startAgent(opts)` function from `backend/src/remote-agent-entry.ts` — extract the server startup logic into an exported function that accepts `{ port, host }` options, similar to `startHub()`
- [x] T019 [US3] Add `adyx agent` command in `backend/src/cli.ts` — options: `--port` (default 4100), `--host` (default 0.0.0.0); runs pre-flight check then calls `startAgent()`
- [x] T020 [US3] Add pre-flight dependency check to `adyx agent` in `backend/src/cli.ts` — same pattern as `adyx start`, warn on missing deps

**Checkpoint**: `adyx agent` works from any directory, starts remote agent on configured port

---

## Phase 6: User Story 4 - Dependency Health Check (Priority: P2)

**Goal**: `adyx doctor` reports status of all required dependencies

**Independent Test**: Run `adyx doctor` and verify it prints status of tmux, gh, node

### Tests for User Story 4 (MANDATORY per Constitution Principle I)

- [x] T021 [US4] Write system test for `adyx doctor` in `backend/tests/system/cli.test.ts` — spawn `node backend/dist/cli.js doctor` and verify it exits 0, outputs each dependency name, and reports at least node as installed

### Implementation for User Story 4

- [x] T022 [US4] Add `adyx doctor` command in `backend/src/cli.ts` — run `checkAllDependencies()`, format with `formatDependencyReport()`, print results, exit 0 if all satisfied, exit 1 if any required dep missing

**Checkpoint**: `adyx doctor` accurately reports all dependency statuses

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, CI

- [x] T023 Verify all tests pass with `npm test`
- [x] T024 Run `npm run lint` and `npm run typecheck` — fix any issues
- [ ] T025 Verify `npm install -g .` works end-to-end on current machine (global install, adyx start, adyx agent, adyx doctor)
- [ ] T026 Run quickstart.md validation — verify all example commands from `specs/025-global-install-cli/quickstart.md` work as documented
- [ ] T027 Push branch, wait for CI green, rebase-merge to main (Principle V)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (install/postinstall) can proceed independently
  - US2 (adyx start) can proceed independently
  - US3 (adyx agent) can proceed independently
  - US4 (adyx doctor) can proceed independently
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends only on Phase 2 — no cross-story dependencies
- **User Story 2 (P1)**: Depends only on Phase 2 — no cross-story dependencies
- **User Story 3 (P1)**: Depends only on Phase 2 — no cross-story dependencies
- **User Story 4 (P2)**: Depends only on Phase 2 — no cross-story dependencies

### Within Each User Story

- Tests written first (fail before implementation)
- Implementation tasks in dependency order
- Story complete before checkpoint validation

### Parallel Opportunities

- T003, T004, T005, T006 are sequential (same file, building on each other)
- T008, T012, T017, T021 (test tasks across stories) can run in parallel once Phase 2 is done
- T009 and T013 and T018 and T022 (implementation across stories) can run in parallel once Phase 2 is done
- All Phase 7 tasks are sequential

---

## Parallel Example: After Phase 2

```bash
# All user story implementations can start in parallel:
Task: T009 [US1] Create postinstall script at backend/scripts/postinstall.js
Task: T013 [US2] Add pre-flight dependency check to adyx start in backend/src/cli.ts
Task: T018 [US3] Export startAgent function from backend/src/remote-agent-entry.ts
Task: T022 [US4] Add adyx doctor command in backend/src/cli.ts

# Note: T013, T019, T022 all modify cli.ts — if implementing sequentially,
# do US2 cli changes first, then US3, then US4 to avoid conflicts
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (dependency checker)
3. Complete Phase 3: User Story 1 (postinstall)
4. Complete Phase 4: User Story 2 (adyx start with browser open)
5. **STOP and VALIDATE**: Test install + start flow end-to-end
6. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → Dependency checker ready
2. Add US1 (postinstall) → Test install flow → Checkpoint
3. Add US2 (adyx start) → Test start + browser open → Checkpoint
4. Add US3 (adyx agent) → Test agent start → Checkpoint
5. Add US4 (adyx doctor) → Test doctor output → Checkpoint
6. Polish → CI green → Merge

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- The postinstall script (T009) MUST be plain JS — it runs before TypeScript compilation
- Multiple user stories modify `backend/src/cli.ts` — implement sequentially within that file (US2 → US3 → US4)
- Pre-flight checks should WARN, never BLOCK startup (user may want to run hub without tmux for testing)
- Commit after each task or logical group
