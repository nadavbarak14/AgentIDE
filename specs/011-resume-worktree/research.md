# Research: Session Resume & Worktree Isolation

**Feature**: 011-resume-worktree
**Date**: 2026-02-20

## R1: Session Resume Mechanism

**Decision**: Use `claude --resume <claudeSessionId>` for targeted resume, fall back to `claude -c` when no ID stored.

**Rationale**:
- The `claudeSessionId` is already captured by the SessionEnd hook and stored in `sessions.claude_session_id`
- Current code at `session-manager.ts:65-79` always uses `claude -c` which resumes the most recent conversation in the directory — not necessarily the correct one
- `--resume <id>` is a Claude Code CLI flag that targets a specific conversation by ID
- When `claudeSessionId` is null (legacy sessions or failed hook capture), `-c` is the correct fallback

**Alternatives considered**:
- Always use `-c`: Current behavior, causes cross-contamination in shared directories. Rejected.
- Store conversation ID in a file per session: Unnecessary — DB already has the field populated via hooks.

**Existing code paths**:
- `session-manager.ts:activateSession()` (line 54-97): Handles spawn logic. Currently has `continuationCount > 0 && claudeSessionId` branch but uses `spawnContinue()` which passes `-c` not `--resume`.
- `pty-spawner.ts:spawnContinue()` (line 196-200): Calls `spawn(sessionId, workingDirectory, ['-c'])`. Needs a new method or parameter for `--resume <id>`.
- `pty-spawner.ts:spawn()` (line 93-194): Accepts arbitrary `args` array — can pass `['--resume', claudeSessionId]` directly.

## R2: Worktree Toggle — Database Schema

**Decision**: Add `worktree INTEGER NOT NULL DEFAULT 0` column to the `sessions` table via migration in `db.ts`.

**Rationale**:
- SQLite boolean convention in this project uses `INTEGER` with 0/1 (see `needs_input`, `lock`, `auto_approve`)
- Default 0 preserves backward compatibility — existing sessions are non-worktree
- No new table needed; this is a session attribute

**Alternatives considered**:
- JSON config column: Over-engineered for a single boolean. Rejected.
- Separate session_options table: Unnecessary indirection. Rejected.

## R3: Worktree Toggle — Frontend Form

**Decision**: Add checkbox in `SessionQueue.tsx` session creation form, mirroring the existing `startFresh` checkbox pattern.

**Rationale**:
- Existing pattern: `startFresh` is a checkbox with state, passed through `onCreateSession` callback
- Same approach for `worktree`: local state → callback → API → DB → spawn args
- Worktree defaults to off (unchecked)

## R4: Worktree Flag Propagation

**Decision**: Pass `--worktree` flag in `pty-spawner.ts:spawn()` args when session has `worktree=true`. Only on initial spawn, NOT on continuation.

**Rationale**:
- Per spec edge case: "continuation should use `--resume` with the conversation ID without re-adding the `--worktree` flag, since the worktree context from the original session may no longer exist"
- The worktree is a one-time setup that happens at first spawn
- On continuation, the worktree already exists (or doesn't) — re-adding the flag could cause issues

## R5: API Changes

**Decision**: Accept `worktree?: boolean` in POST /api/sessions body. Store in DB. Read back in Session response.

**Rationale**:
- Follows existing pattern for `startFresh` (accepted in body, not stored in DB but used as flag)
- Unlike `startFresh`, `worktree` MUST be persisted (FR-005) so it survives queue wait and server restarts
- `worktree` appears in the Session response so frontend can display status
