# Feature Specification: Session Resume & Worktree Isolation

**Feature Branch**: `011-resume-worktree`
**Created**: 2026-02-20
**Status**: Draft
**Input**: User description: "Specific session resume with claudeSessionId and worktree toggle in session creation UI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resume Specific Claude Conversation (Priority: P1)

A user has a completed session that was working on a feature. They click "Continue" to resume it. The system resumes the exact Claude conversation from that session — not a different conversation that happened to run in the same directory. This prevents accidental cross-contamination between sessions sharing the same working directory.

**Why this priority**: Without specific resume, continuing a session in a shared directory may load a completely unrelated conversation, confusing the user and losing context. This is a correctness issue.

**Independent Test**: Can be tested by creating two sessions in the same directory, completing both, then continuing each — each should resume its own conversation.

**Acceptance Scenarios**:

1. **Given** a completed session with a stored conversation ID, **When** the user clicks "Continue", **Then** the system resumes that specific conversation (not the most recent one in the directory).
2. **Given** a completed session without a stored conversation ID (legacy or failed capture), **When** the user clicks "Continue", **Then** the system falls back to resuming the most recent conversation in that directory.
3. **Given** a session that was auto-suspended and re-queued, **When** the queue dispatches it, **Then** it resumes the exact conversation it was running before suspension.

---

### User Story 2 - Enable Worktree Isolation for a Session (Priority: P2)

A user creates a new session and wants it to work in isolation — without conflicting with other sessions editing the same repository. They toggle a "Worktree" option in the session creation form. The system spawns Claude Code with the `--worktree` flag, which creates a separate git worktree with its own branch and file state.

**Why this priority**: File conflicts between parallel sessions cause corrupted diffs, merge issues, and lost work. Worktree isolation eliminates this class of problems for users running multiple sessions on the same repo.

**Independent Test**: Can be tested by creating a session with worktree enabled, verifying Claude starts in an isolated worktree directory, and confirming the main repo is unaffected.

**Acceptance Scenarios**:

1. **Given** the session creation form, **When** the user toggles the worktree option on, **Then** the session is created with the worktree preference stored.
2. **Given** a queued session with worktree enabled, **When** it activates, **Then** Claude Code is launched with the `--worktree` flag.
3. **Given** a session with worktree disabled (default), **When** it activates, **Then** Claude Code is launched without the `--worktree` flag (existing behavior).

---

### Edge Cases

- What happens when resuming a session whose conversation was deleted from Claude's local storage? The system should detect the failure and fall back to starting a new conversation, displaying a notification to the user.
- What happens when a worktree-enabled session is continued after completion? The continuation should use `--resume` with the conversation ID (US1) without re-adding the `--worktree` flag, since the worktree context from the original session may no longer exist.
- What happens when worktree is enabled but the working directory is not a git repository? Claude Code's `--worktree` flag will fail. The error should surface in the terminal output — no special pre-validation is needed since the user can see the error.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST use `--resume <conversationId>` to resume the specific conversation when continuing a session that has a stored conversation ID.
- **FR-002**: System MUST fall back to `--continue` (resume most recent conversation in directory) when no conversation ID is stored.
- **FR-003**: The session creation form MUST include a toggle for worktree isolation, defaulted to off.
- **FR-004**: System MUST pass the `--worktree` flag to Claude Code when spawning a new session that has worktree enabled.
- **FR-005**: System MUST persist the worktree preference per session so it survives queue wait and server restarts.
- **FR-006**: The worktree toggle MUST be visible in the session creation UI alongside existing fields (title, working directory).

### Key Entities

- **Session**: Extended with a `worktree` boolean attribute indicating whether the session should use git worktree isolation.
- **Conversation ID**: The Claude-side session identifier (`claudeSessionId`) already captured on session exit via hooks — now used for targeted resume.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Continuing a session with a stored conversation ID resumes the correct conversation 100% of the time (no cross-contamination).
- **SC-002**: Sessions with worktree enabled launch in an isolated worktree, confirmed by the working directory being different from the original repo root.
- **SC-003**: The worktree toggle is visible and functional in the session creation UI with a single click.
- **SC-004**: Fallback behavior (no conversation ID, worktree errors) degrades gracefully without blocking the user.

## Assumptions

- The `claudeSessionId` is reliably captured by the existing SessionEnd hook and stored in the database. This is already implemented.
- Claude Code's `--resume <id>` flag accepts the conversation ID format stored in the database.
- Claude Code's `--worktree` flag is available in the installed version of Claude Code on the system.
- Non-worktree sessions (the default) continue to work exactly as they do today.
