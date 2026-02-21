# Implementation Plan: Remote Directory Support for SSH Workers

**Branch**: `013-remote-directory-support` | **Date**: 2026-02-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-remote-directory-support/spec.md`

## Summary

Enable remote SSH workers to use any directory path on the remote server's filesystem, removing the local home directory restriction while maintaining that restriction for local workers. The implementation modifies directory validation logic to be worker-type-aware, extends the directory browsing API to query remote filesystems via SSH, and updates error messaging to distinguish between local and remote path restrictions.

## Technical Context

**Language/Version**: TypeScript 5.7, Node.js 20 LTS
**Primary Dependencies**: Express 4, ssh2 (existing), better-sqlite3 (existing)
**Storage**: SQLite (better-sqlite3) — existing workers and sessions tables
**Testing**: Vitest 2.1.0 (unit + integration tests)
**Target Platform**: Linux/WSL2 hub server + Unix-like remote servers via SSH
**Project Type**: Web application (backend API + frontend UI)
**Performance Goals**: Directory browsing <1s, session creation <3s
**Constraints**: SSH connection must be maintained, home directory validation preserved for local workers (security)
**Scale/Scope**: Support multiple concurrent remote workers, handle network latency for remote directory operations

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Principle I: Comprehensive Testing ✅
- **Unit tests required**: Directory validation logic (worker-type-aware), SSH directory operations
- **System tests required**: End-to-end session creation with remote paths, directory browsing API with remote worker
- **Real dependencies**: Tests will use real SSH connections to test containers (not mocked), real SQLite database
- **Justification**: SSH operations are critical and must be tested against real SSH servers to catch connection/permission issues

### Principle II: UX-First Design ✅
- **User workflows**: Spec defines 3 prioritized user stories with acceptance scenarios
- **Clear user benefit**: Enables remote development workflows, eliminates "directory not allowed" errors for remote workers
- **Error messaging**: FR-004 requires clear distinction between local restrictions and remote access issues
- **Performance**: Directory browsing must feel responsive even over SSH

### Principle III: UI Quality & Consistency ✅
- **Frontend changes**: Directory picker component must show remote paths when remote worker selected
- **Visual feedback**: Loading states during remote directory queries, clear error messages
- **Consistency**: Matches existing directory picker behavior, extends for remote context

### Principle IV: Simplicity ✅
- **Approach**: Modify existing validation logic to check worker type; extend existing SSH tunnel manager to support directory operations
- **No new abstractions**: Reuses existing Worker model, SSH connection pooling, directory browsing API
- **Complexity justified**: Worker-type conditional logic is inherent requirement (local must remain restricted for security)

### Principle V: CI/CD Pipeline & Autonomous Merge ✅
- **Process**: Follow standard workflow (push → PR → CI green → rebase merge)
- **CI requirements**: All existing tests must pass + new tests for remote directory support

### Principle VI: Frontend Plugin Quality ✅
- **No new frontend dependencies**: Uses existing React components, extends directory picker logic

### Principle VII: Backend Security & Correctness ✅
- **Security critical**: Local home directory restriction MUST be preserved (FR-002)
- **Input validation**: Remote directory paths must be validated (no path traversal, injection)
- **Error handling**: SSH connection failures must be handled gracefully (FR-008)
- **Data integrity**: Worker type must persist with session (FR-009) to ensure correct validation on resume

### Principle VIII: Observability & Logging ✅
- **Logging required**: Remote directory operations (attempts, successes, failures), SSH connection issues, validation rejections
- **Context**: Session ID, worker ID, worker type, requested path, error details
- **Troubleshooting**: Logs must distinguish local vs. remote validation failures

**GATE RESULT**: ✅ PASS — All constitution principles satisfied, no violations require justification

## Project Structure

### Documentation (this feature)

```text
specs/013-remote-directory-support/
├── plan.md              # This file
├── research.md          # Phase 0 output (next)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-contracts.md
└── tasks.md             # Phase 2 output (/speckit.tasks - not created here)
```

### Source Code (repository root)

```text
backend/
├── src/
│   ├── models/
│   │   └── types.ts                    # Worker type enum (existing)
│   ├── services/
│   │   ├── ssh-tunnel-manager.ts       # MODIFY: Add directory browsing methods
│   │   └── session-manager.ts          # MODIFY: Worker-aware validation
│   └── api/
│       ├── routes/
│       │   ├── sessions.ts              # MODIFY: Worker-aware directory validation
│       │   ├── directories.ts           # MODIFY: Remote directory browsing
│       │   └── projects.ts              # MODIFY: Remote project creation
│       └── middleware.ts                # Existing validation utilities
└── tests/
    ├── unit/
    │   ├── directory-security.test.ts   # MODIFY: Add remote worker cases
    │   └── ssh-tunnel-manager.test.ts   # NEW: Remote directory operations
    └── integration/
        ├── remote-session.test.ts       # MODIFY: Remote path scenarios
        └── remote-directories.test.ts   # NEW: Directory browsing E2E

frontend/
├── src/
│   ├── components/
│   │   └── DirectoryPicker.tsx          # MODIFY: Remote path support
│   └── services/
│       └── api.ts                       # MODIFY: Worker-aware directory queries
└── tests/
    └── unit/
        └── components/
            └── DirectoryPicker.test.tsx  # MODIFY: Remote worker scenarios
```

**Structure Decision**: Web application structure (backend + frontend) is already established. This feature extends existing code without adding new top-level directories. Changes are surgical: modify validation logic in sessions/directories routes, extend SSH tunnel manager for directory operations, update UI components to handle worker context.

## Complexity Tracking

*No constitution violations requiring justification — all complexity is inherent to the feature requirements (worker-type conditional logic for security).*

---

## Phase Completion Status

### Phase 0: Research ✅ COMPLETE
- **Output**: `research.md`
- **Key Decisions**:
  - Use `ssh2` SFTP subsystem for remote directory operations
  - Worker-type-aware validation pattern (lookup worker type, branch validation logic)
  - Extend existing `/api/directories` endpoint with `workerId` parameter
  - Error reason codes to distinguish local restrictions from remote access issues

### Phase 1: Design & Contracts ✅ COMPLETE
- **Outputs**:
  - `data-model.md` — Entity modifications and validation logic flow
  - `contracts/api-contracts.md` — Modified API endpoints with worker context
  - `quickstart.md` — User guide and troubleshooting
- **Agent Context**: Updated CLAUDE.md with technology additions
- **Schema Changes**: None required (reuses existing Worker and Session tables)

### Constitution Re-Check (Post-Design) ✅ PASS

**Reviewed against all 8 principles after completing design phase:**

All principles remain satisfied. Design maintains:
- ✅ Real dependencies in tests (SSH test containers, real SQLite)
- ✅ User-first approach (clear error messages, remote path browsing)
- ✅ UI consistency (extends existing directory picker pattern)
- ✅ Simplicity (no new abstractions, reuses existing code)
- ✅ CI/CD compliance (standard merge workflow)
- ✅ No new frontend dependencies
- ✅ Security maintained (local restriction preserved, SSH permission model)
- ✅ Comprehensive logging (worker context, path operations, errors)

**No design changes required** — ready for task generation (`/speckit.tasks`)

---

## Next Steps

Run `/speckit.tasks` to generate the implementation task breakdown based on this plan.
