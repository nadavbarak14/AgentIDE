# Feature Specification: Remote Directory Support for SSH Workers

**Feature Branch**: `013-remote-directory-support`
**Created**: 2026-02-21
**Status**: Draft
**Input**: User description: "Allow remote sessions to use directories on remote servers outside local home directory"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create Remote Session with Remote Directory (Priority: P1)

A user wants to start a Claude Code session on a remote SSH worker using a project directory that exists on the remote server's filesystem (e.g., `/opt/projects/myapp`). Currently, the system rejects this because it only allows directories within the hub server's local home directory.

**Why this priority**: This is the core functionality needed to make remote SSH workers useful for real-world scenarios where projects live on remote servers.

**Independent Test**: Can be fully tested by creating a remote worker, attempting to create a session with a remote path like `/opt/projects/test`, and verifying the session starts successfully.

**Acceptance Scenarios**:

1. **Given** a configured remote SSH worker, **When** user creates a session with directory `/home/ubuntu/project` on the remote server, **Then** the session is created successfully and Claude Code runs in that remote directory
2. **Given** a configured remote SSH worker, **When** user creates a session with directory `/opt/webapp` on the remote server, **Then** the session is created successfully without home directory validation errors
3. **Given** a local worker selected, **When** user creates a session with directory outside local home, **Then** the system rejects it with a clear error message (security restriction applies to local only)

---

### User Story 2 - Browse Remote Directories (Priority: P2)

A user wants to browse the remote server's filesystem when selecting a directory for a new remote session, seeing directories that exist on the remote server rather than the local hub server.

**Why this priority**: Without directory browsing, users must manually type remote paths, which is error-prone and user-unfriendly.

**Independent Test**: Can be tested by opening the directory picker when a remote worker is selected and verifying it shows the remote server's directories.

**Acceptance Scenarios**:

1. **Given** a remote worker is selected, **When** user opens the directory picker, **Then** the system shows directories from the remote server's filesystem
2. **Given** browsing remote directories, **When** user navigates to `/opt/projects`, **Then** the system shows subdirectories from the remote server's `/opt/projects` path
3. **Given** browsing remote directories, **When** user types a partial path like `/ho`, **Then** the system autocompletes with remote server paths like `/home`

---

### User Story 3 - Auto-create Remote Directories (Priority: P3)

A user wants to create a new project directory on the remote server when starting a session, similar to the auto-create behavior for local sessions.

**Why this priority**: This is a convenience feature that matches existing local behavior, but not strictly required for MVP since users can manually create directories via SSH.

**Independent Test**: Can be tested by attempting to create a session with a non-existent remote path and verifying it gets created on the remote server.

**Acceptance Scenarios**:

1. **Given** a remote worker and non-existent directory `/home/ubuntu/new-project`, **When** user creates a session with that path, **Then** the directory is created on the remote server before session starts
2. **Given** a remote worker and non-existent nested path `/home/ubuntu/foo/bar/baz`, **When** user creates session with that path, **Then** all parent directories are created recursively on the remote server

---

### Edge Cases

- What happens when the remote directory path doesn't exist and auto-create fails due to permissions?
- How does the system handle remote paths that exist but are not readable/writable by the SSH user?
- What happens if the SSH connection fails while browsing or creating directories?
- How does the system distinguish between local and remote worker types to apply the correct validation rules?
- What happens when switching from a local worker to a remote worker in the UI - does directory validation update?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow sessions on remote SSH workers to use any directory path on the remote server, not restricted to the hub server's home directory
- **FR-002**: System MUST continue to enforce home directory restriction for local worker sessions (security requirement)
- **FR-003**: System MUST validate directory paths based on the selected worker type (local vs. remote)
- **FR-004**: System MUST provide clear error messages when directory validation fails, indicating whether it's a local restriction or remote access issue
- **FR-005**: Directory browsing API MUST return remote server directories when a remote worker is selected
- **FR-006**: Directory browsing API MUST return local hub directories when a local worker is selected
- **FR-007**: System MUST support auto-creating directories on remote servers when they don't exist (matching local behavior)
- **FR-008**: System MUST handle SSH connection failures gracefully when browsing or creating remote directories
- **FR-009**: System MUST persist the worker type with each session so directory validation can be applied correctly on session resume

### Key Entities

- **Session**: Has a `targetWorker` which determines whether directory validation applies (local = home restriction, remote = no restriction)
- **Worker**: Has a type (local, ssh) that determines directory validation behavior
- **Directory Path**: Validated differently based on associated worker type

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can successfully create sessions on remote workers using any directory path accessible to the SSH user (100% success rate for valid remote paths)
- **SC-002**: Local worker sessions continue to enforce home directory restriction (0% false positives - no local sessions allowed outside home)
- **SC-003**: Directory browsing shows remote server paths when remote worker selected (0% confusion - users never see local paths when remote worker active)
- **SC-004**: Clear error messages reduce support tickets about "directory not allowed" errors by 80% (by distinguishing local vs. remote restrictions)

## Assumptions *(include if relevant)*

- Remote SSH workers are already implemented and functional
- SSH user on remote server has appropriate permissions to create directories in target paths
- Network connectivity between hub server and remote workers is reliable enough for directory browsing
- Worker type (local vs. ssh) can be reliably determined from worker configuration

## Dependencies *(include if feature relies on other work)*

- Existing SSH worker implementation (from previous feature)
- Existing directory security validation code needs modification to be worker-aware
- Existing directory browsing API needs modification to query remote vs. local filesystem

## Out of Scope

- Implementing SSH worker connections (already exists)
- Implementing file browsing/editing within remote directories (existing feature)
- Implementing permission checking on remote directories before session creation (validation happens during session start)
- Supporting Windows remote workers (SSH workers assume Unix-like remote servers)
