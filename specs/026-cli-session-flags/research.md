# Research: CLI Session Flags Redesign

**Feature**: 026-cli-session-flags
**Date**: 2026-03-06

## R1: Current Session Spawn Logic

**Decision**: Invert the default — spawn fresh by default, `--continue` only when explicitly requested via "Continue Latest" toggle.

**Rationale**: Currently `activateLocalSession()` in `session-manager.ts` uses `--continue` by default unless `startFresh=true` or `worktree=true`. The spec requires the opposite: fresh by default, `--continue` only when explicitly toggled.

**Current code path** (session-manager.ts:119-141):
- `startFresh || session.worktree` → spawn without `--continue`
- else → spawn with `--continue` (default)

**New code path**:
- Default (no flags) → spawn without `--continue` (fresh)
- `continueLatest=true` → spawn with `--continue`
- `resume=true` → spawn with `--resume` (no args — Claude's interactive picker)
- `worktree=true` → spawn with `--worktree` (unchanged)

**Alternatives considered**:
- Keep `startFresh` and just change default to `true` → rejected; confusing to have a flag that's `true` by default. Cleaner to replace with `continueLatest`.

## R2: Claude CLI Resume Flag

**Decision**: Use `--resume` (no arguments) to let Claude open its built-in interactive session picker in the terminal.

**Rationale**: Claude CLI supports:
- `-c, --continue` — continue most recent conversation
- `-r, --resume [value]` — resume by session ID, or **open interactive picker when no value given**
- `--session-id <uuid>` — use specific session ID

Running `claude --resume` (no args) opens Claude's own session picker, which shows recent conversations and lets the user select one. This eliminates the need to build a custom conversation browser — Claude already has one.

**Alternatives considered**:
- Build custom conversation browser reading `~/.claude/projects/` JSONL files → rejected; unnecessary complexity when Claude already provides an interactive picker
- `--resume <session-id>` with our own UI for selection → rejected; same reason

## R3: Frontend Toggle Design

**Decision**: Replace "Clean Start" with "Continue Latest" and add "Resume" as a new toggle. Make them mutually exclusive.

**Rationale**: The existing `PREDEFINED_FLAGS` array in `SessionQueue.tsx` already has the toggle pattern. Minimal changes needed.

**Current PREDEFINED_FLAGS**:
```typescript
{ id: 'skip-permissions', label: 'Skip Permissions', ... },
{ id: 'worktree', label: 'Worktree', ... },
{ id: 'clean-start', label: 'Clean Start', ... },
```

**New PREDEFINED_FLAGS**:
```typescript
{ id: 'skip-permissions', label: 'Skip Permissions', ... },
{ id: 'worktree', label: 'Worktree', ... },
{ id: 'continue-latest', label: 'Continue Latest', description: 'Resume most recent conversation (-c)', ... },
{ id: 'resume', label: 'Resume', description: 'Pick a session to resume (--resume)', ... },
```

**State changes**:
- Remove `startFresh` state
- Add `continueLatest` state (boolean, default false)
- Add `resume` state (boolean, default false)
- Toggling one deactivates the other (mutually exclusive)

## R4: Backend Type Changes

**Decision**: Replace `startFresh` with `continueLatest` and `resume` in `CreateSessionInput`.

**Type change**:
```typescript
export interface CreateSessionInput {
  workingDirectory: string;
  title: string;
  targetWorker?: string | null;
  worktree?: boolean;
  startFresh?: boolean;       // REMOVE (no longer used)
  continueLatest?: boolean;   // NEW: maps to --continue
  resume?: boolean;           // NEW: maps to --resume (no args)
  flags?: string;
}
```

**Session manager logic change** (`activateLocalSession`):
```typescript
// Before:
if (startFresh || session.worktree) { /* no --continue */ }
else { /* --continue */ }

// After:
if (continueLatest) { args = ['--continue', ...userFlags]; }
else if (resume) { args = ['--resume', ...userFlags]; }
else if (session.worktree) { args = ['--worktree', ...userFlags]; }
else { args = [...userFlags]; }  // fresh (default)
```

## R5: Continue-Session Retry Logic

**Decision**: Preserve existing retry logic for `--continue` failures.

**Rationale**: The `continueSessions` Map tracking in session-manager.ts should still work — it's keyed by session ID and triggered when a `--continue` session exits with non-zero within 30 seconds. The only change is that we explicitly track when `continueLatest` was used.

No changes needed to the retry mechanism itself — just ensure the `continueLatest` path still populates `continueSessions`.
