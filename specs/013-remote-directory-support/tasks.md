# Implementation Tasks: Remote Directory Support for SSH Workers

**Feature**: 013-remote-directory-support
**Branch**: `013-remote-directory-support`
**Date**: 2026-02-21

## Overview

This document breaks down the implementation into independently testable user story increments. Each phase delivers a complete, demonstrable feature slice.

**Total Tasks**: 31 (18 implementation + 13 tests)
**Parallel Opportunities**: 15 tasks can run in parallel
**Estimated MVP**: User Story 1 (P1) - Core remote session support

---

## Implementation Strategy

### MVP First (User Story 1 Only)
- Delivers core value: Remote sessions work with any remote path
- Validates technical approach before expanding
- Can ship to production for early feedback
- Tasks: T001-T011 (11 tasks)

### Incremental Delivery
- **US1 (P1)**: Remote session creation with worker-aware validation
- **US2 (P2)**: Remote directory browsing in UI
- **US3 (P3)**: Auto-create convenience feature

### Parallel Execution
- Within each story, tasks marked `[P]` can run simultaneously
- Different files = no conflicts
- Maximizes development velocity

---

## Dependency Graph

```
Phase 1: Setup
  ↓
Phase 2: Foundational (Blocks all user stories)
  ├─→ Phase 3: User Story 1 (P1) [MVP] ← Can ship after this
  ├─→ Phase 4: User Story 2 (P2)
  └─→ Phase 5: User Story 3 (P3)
       ↓
Phase 6: Polish & Cross-Cutting
```

**User Story Dependencies**:
- US1 has no dependencies (foundational)
- US2 depends on US1 (uses session validation logic)
- US3 depends on US1 (uses session creation flow)

**Parallel Execution Per Story**:
- US1: 5 parallel tasks (T004-T008)
- US2: 4 parallel tasks (T015-T018)
- US3: 3 parallel tasks (T024-T026)

---

## Phase 1: Setup

**Goal**: Prepare development environment and ensure all dependencies available

**Tasks**:

- [x] T001 Review existing codebase structure from plan.md (backend/src/, backend/tests/, frontend/src/)
- [x] T002 Verify ssh2, better-sqlite3, express dependencies present in package.json
- [x] T003 Create git feature branch `013-remote-directory-support` and push to remote

**Estimated**: 15 minutes

---

## Phase 2: Foundational (Prerequisites)

**Goal**: Establish core directory validation abstraction that all user stories will use

**Why Foundational**: Worker-type-aware validation is required by US1, US2, and US3. Must be completed before any user story work begins.

**Tasks**:

- [x] T004 [P] Create unit test for worker-type-aware validation in backend/tests/unit/directory-security.test.ts (add remote worker test cases)
- [x] T005 [P] Implement validateDirectoryForWorker() helper function in backend/src/api/routes/directories.ts (checks worker type, branches validation logic)
- [x] T006 Update isWithinHomeDir() usage to call validateDirectoryForWorker() in backend/src/api/routes/sessions.ts

**Independent Test**: Run `npm test -- directory-security` → all tests pass including new remote worker cases

**Estimated**: 2 hours

---

## Phase 3: User Story 1 (P1) - Create Remote Session with Remote Directory

**Goal**: Enable users to create Claude Code sessions on remote workers using any directory path on the remote server

**Why P1**: Core functionality needed to make remote SSH workers useful for real-world scenarios

**Independent Test Criteria**:
- ✅ Remote worker + remote path → session created successfully
- ✅ Local worker + path outside home → 403 with clear error message
- ✅ Existing tests still pass (no regressions in local worker behavior)

**Acceptance Scenarios** (from spec.md):
1. Remote worker + `/home/ubuntu/project` → session created
2. Remote worker + `/opt/webapp` → session created without home directory errors
3. Local worker + path outside home → rejected with clear error

### Tasks

**Testing**:

- [x] T007 [P] [US1] Add unit test for worker lookup in session creation flow in backend/tests/unit/session-manager.test.ts
- [x] T008 [P] [US1] Add integration test for remote session creation in backend/tests/integration/remote-session.test.ts (test all 3 acceptance scenarios)

**Implementation**:

- [x] T009 [US1] Modify session creation route to use validateDirectoryForWorker() in backend/src/api/routes/sessions.ts (replace isWithinHomeDir check)
- [x] T010 [US1] Add worker type to error response for better debugging in backend/src/api/routes/sessions.ts (include reason, workerType fields)
- [x] T011 [US1] Add logging for directory validation failures in backend/src/api/routes/sessions.ts (log workerId, workerType, path, reason)

**Verification**:

Run `npm test -- remote-session` → all scenarios pass

**Parallel Execution Example**:
```bash
# Terminal 1: Tests
npm test -- directory-security.test.ts --watch

# Terminal 2: Tests
npm test -- session-manager.test.ts --watch

# Terminal 3: Implementation
# Edit backend/src/api/routes/sessions.ts
```

**Estimated**: 4 hours

---

## Phase 4: User Story 2 (P2) - Browse Remote Directories

**Goal**: Enable users to browse remote server filesystem when selecting directory for remote session

**Why P2**: Without directory browsing, users must manually type remote paths (error-prone, poor UX)

**Dependencies**: Requires US1 complete (uses worker-type validation logic)

**Independent Test Criteria**:
- ✅ Remote worker selected → directory picker shows remote filesystem
- ✅ Navigate to `/opt/projects` → shows remote subdirectories
- ✅ Type partial path `/ho` → autocompletes with remote paths
- ✅ Local worker selected → directory picker shows local filesystem (no change from existing behavior)

**Acceptance Scenarios** (from spec.md):
1. Remote worker + directory picker → shows remote server directories
2. Navigate to `/opt/projects` → shows remote subdirectories
3. Type partial path `/ho` → autocompletes from remote server

### Tasks

**Backend - SSH Operations**:

- [ ] T012 [P] [US2] Add unit test for SSH directory listing in backend/tests/unit/ssh-tunnel-manager.test.ts (mock sftp.readdir)
- [ ] T013 [P] [US2] Implement listRemoteDirectories() method in backend/src/services/ssh-tunnel-manager.ts (use sftp.readdir, filter directories)
- [ ] T014 [US2] Add error handling for SSH connection failures in backend/src/services/ssh-tunnel-manager.ts (catch ENOENT, EACCES, connection errors)

**Backend - API**:

- [ ] T015 [P] [US2] Add integration test for remote directory browsing API in backend/tests/integration/remote-directories.test.ts (test workerId query param)
- [ ] T016 [P] [US2] Modify GET /api/directories to accept workerId query param in backend/src/api/routes/directories.ts
- [ ] T017 [US2] Add routing logic to call listRemoteDirectories() when remote worker in backend/src/api/routes/directories.ts (check worker type, delegate to SSH tunnel manager)
- [ ] T018 [US2] Add remote flag to directory response payload in backend/src/api/routes/directories.ts (include remote: true/false, workerId)

**Frontend**:

- [ ] T019 [P] [US2] Add unit test for DirectoryPicker with workerId prop in frontend/tests/unit/components/DirectoryPicker.test.tsx
- [ ] T020 [US2] Add selectedWorkerId prop to DirectoryPicker component in frontend/src/components/DirectoryPicker.tsx
- [ ] T021 [US2] Update API calls to include workerId query param in frontend/src/components/DirectoryPicker.tsx (pass to /api/directories)
- [ ] T022 [US2] Add loading state for remote directory queries in frontend/src/components/DirectoryPicker.tsx (show spinner, handle 500ms latency)

**Verification**:

Run `npm test -- remote-directories` → API returns remote paths
Run `npm test -- DirectoryPicker` → component handles worker context

**Parallel Execution Example**:
```bash
# Terminal 1: Backend SSH tests
npm test -- ssh-tunnel-manager.test.ts --watch

# Terminal 2: Backend API tests
npm test -- remote-directories.test.ts --watch

# Terminal 3: Frontend tests
cd frontend && npm test -- DirectoryPicker.test.tsx --watch

# Terminal 4: Implementation
# Edit ssh-tunnel-manager.ts, directories.ts, DirectoryPicker.tsx in parallel
```

**Estimated**: 6 hours

---

## Phase 5: User Story 3 (P3) - Auto-create Remote Directories

**Goal**: Auto-create remote directories that don't exist (matching local session behavior)

**Why P3**: Convenience feature; not required for MVP since users can manually create directories via SSH

**Dependencies**: Requires US1 complete (uses session creation flow)

**Independent Test Criteria**:
- ✅ Remote worker + non-existent path → directory created on remote server before session starts
- ✅ Remote worker + nested path `/foo/bar/baz` → all parent directories created recursively
- ✅ Permission denied → clear error message (not silent failure)

**Acceptance Scenarios** (from spec.md):
1. Remote worker + non-existent `/home/ubuntu/new-project` → directory auto-created
2. Remote worker + nested `/home/ubuntu/foo/bar/baz` → all parents created recursively

### Tasks

**Backend - SSH Operations**:

- [ ] T023 [P] [US3] Add unit test for SSH directory creation in backend/tests/unit/ssh-tunnel-manager.test.ts (mock sftp.mkdir)
- [ ] T024 [P] [US3] Implement createRemoteDirectory() method in backend/src/services/ssh-tunnel-manager.ts (use sftp.mkdir with recursive: true)
- [ ] T025 [US3] Add permission error handling in backend/src/services/ssh-tunnel-manager.ts (catch EACCES, return clear error message)

**Backend - Integration**:

- [ ] T026 [P] [US3] Add integration test for auto-create in session creation in backend/tests/integration/remote-session.test.ts (verify directory created before session starts)
- [ ] T027 [US3] Modify session creation to auto-create remote directories in backend/src/api/routes/sessions.ts (call createRemoteDirectory if !exists)
- [ ] T028 [US3] Add logging for directory creation attempts in backend/src/api/routes/sessions.ts (log workerId, path, success/failure)

**Verification**:

Run `npm test -- remote-session` → auto-create scenarios pass

**Parallel Execution Example**:
```bash
# Terminal 1: Unit tests
npm test -- ssh-tunnel-manager.test.ts --watch

# Terminal 2: Integration tests
npm test -- remote-session.test.ts --watch

# Terminal 3: Implementation
# Edit ssh-tunnel-manager.ts, sessions.ts
```

**Estimated**: 3 hours

---

## Phase 6: Polish & Cross-Cutting Concerns

**Goal**: Final integration, documentation, and quality assurance

**Tasks**:

- [ ] T029 Run full test suite (backend + frontend) and verify 100% pass rate
- [ ] T030 Review all error messages for clarity and consistency (check reason codes: local_restriction, remote_access_denied, remote_connection_failed)
- [ ] T031 Update CHANGELOG.md with feature description and breaking changes (none expected)

**Verification**:

- All tests pass: `npm test && npm run lint`
- No console errors in frontend when switching between local/remote workers
- Error messages clearly distinguish local restrictions from remote access issues

**Estimated**: 1 hour

---

## Total Effort Estimate

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1: Setup | 3 | 15 min |
| Phase 2: Foundational | 3 | 2 hours |
| Phase 3: User Story 1 (P1) | 5 | 4 hours |
| Phase 4: User Story 2 (P2) | 11 | 6 hours |
| Phase 5: User Story 3 (P3) | 6 | 3 hours |
| Phase 6: Polish | 3 | 1 hour |
| **Total** | **31** | **16-18 hours** |

**MVP (US1 only)**: ~7 hours (Tasks T001-T011)

---

## Testing Strategy

### Unit Tests (Real Dependencies per Constitution)
- **Directory validation**: Test worker type branching logic
- **SSH operations**: Use real SFTP connections (not mocked) to test containers
- **Frontend components**: Test worker context handling

### Integration Tests (End-to-End)
- **Session creation**: Real SSH connection to test server
- **Directory browsing**: Real SFTP queries
- **Auto-create**: Verify directories actually created on remote server

### Test Coverage Requirements
- All modified files must maintain existing coverage
- New SSH operations must have 100% coverage (critical path)
- Error paths must be tested (permission denied, connection failed)

### Test Execution
```bash
# Backend unit tests
npm test -- directory-security ssh-tunnel-manager session-manager

# Backend integration tests
npm test -- remote-session remote-directories

# Frontend unit tests
cd frontend && npm test -- DirectoryPicker

# Full suite
npm test && cd frontend && npm test
```

---

## Rollback Plan

### If Issues Arise During Development

**Feature Flag**: `ENABLE_REMOTE_DIRECTORIES` (environment variable)
- Default: `true`
- Set to `false` to revert to local-only validation

**Safe Rollback Steps**:
1. Set `ENABLE_REMOTE_DIRECTORIES=false` in environment
2. Restart hub server
3. System falls back to local home directory restriction for all workers

**No Data Migration Required**: Feature only adds logic, doesn't change schema

---

## Success Metrics (From Spec)

After implementation, verify:

- ✅ **SC-001**: Remote sessions accept any path accessible to SSH user (100% success rate)
- ✅ **SC-002**: Local sessions still reject paths outside home (0% false positives)
- ✅ **SC-003**: Directory picker shows correct filesystem based on worker type (0% confusion)
- ✅ **SC-004**: Error messages clearly distinguish local restrictions from remote issues

---

## Next Steps After Task Completion

1. **Run full test suite**: `npm test && npm run lint`
2. **Manual testing**:
   - Create remote worker
   - Attempt session with `/opt/project`
   - Browse remote directories in UI
   - Test error scenarios (permission denied, SSH connection failure)
3. **Create pull request**:
   ```bash
   git push -u origin 013-remote-directory-support
   gh pr create --title "feat: Remote directory support for SSH workers" --body "Implements worker-aware directory validation, remote filesystem browsing, and auto-create for remote sessions. See specs/013-remote-directory-support/ for details."
   ```
4. **Wait for CI**: All checks must pass green
5. **Merge**: `gh pr merge --rebase` (after CI passes)

---

## Reference Documentation

- **Specification**: [spec.md](./spec.md) — User stories and requirements
- **Implementation Plan**: [plan.md](./plan.md) — Technical approach and structure
- **API Contracts**: [contracts/api-contracts.md](./contracts/api-contracts.md) — Endpoint specifications
- **Data Model**: [data-model.md](./data-model.md) — Entity relationships and validation
- **Research**: [research.md](./research.md) — Technical decisions and trade-offs
- **Quickstart**: [quickstart.md](./quickstart.md) — User guide and troubleshooting
