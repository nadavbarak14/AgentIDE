# Research: Session Permission Flags

**Feature**: 020-session-permissions
**Date**: 2026-03-03

## R1: How to Pass Custom Flags to the Claude Process

**Decision**: Extend the existing `args` array in `PtySpawner.spawn()` to include user-provided flags. The user's flag string is parsed into an array and appended after the existing `--settings` and `--continue`/`--worktree` args.

**Rationale**: The `PtySpawner.spawn()` method already accepts an `args: string[]` parameter that gets spread into `fullArgs`. The session manager constructs these args based on `worktree` and `startFresh` booleans. Extending this to accept arbitrary flags is a natural fit — no new infrastructure required.

**Alternatives considered**:
- Modifying the hook settings JSON to include permission config → Rejected: Claude Code's `--settings` file is for hooks, not permission flags. Would require understanding Claude's internal settings schema.
- Environment variables → Rejected: Claude Code's permission flags are CLI-based (`--dangerously-skip-permissions`), not env-var based.

## R2: Flag Parsing Strategy

**Decision**: Split the user's flag string by shell-like tokenization (respecting quoted values) into an array. Deduplicate by flag name before merging with system-generated args.

**Rationale**: Users may enter flags like `--dangerously-skip-permissions --allowedTools "Read,Grep"`. Simple space splitting breaks quoted values. A lightweight shell-like parser handles both simple flags and flag-value pairs.

**Alternatives considered**:
- Simple `.split(' ')` → Rejected: breaks `--allowedTools "Read,Grep"` into wrong tokens.
- Full shell parser (e.g., `shell-quote` npm package) → Rejected: overkill for CLI flag parsing. A simple regex-based tokenizer suffices.

## R3: Unifying Worktree/StartFresh with the Flags UI

**Decision**: Replace the existing separate `worktree` and `startFresh` checkboxes with predefined flag chips in the unified flags interface. Internally, the system still extracts `worktree` and `startFresh` from the flags before passing the remaining flags to the spawner. This keeps backward compatibility with the existing activation logic.

**Rationale**: The spec requires consolidating existing checkboxes into the flags UI. However, `worktree` is stored in the database and affects git init logic, and `startFresh` affects the `--continue` decision. These must remain as first-class parameters internally. The flags UI is a presentation-layer change that maps predefined chips to the existing booleans plus passes extra flags through.

**Alternatives considered**:
- Pass `--worktree` as a raw flag to Claude and remove the boolean entirely → Rejected: `worktree` is stored in the DB and used for git auto-init logic. Removing the boolean would break existing behavior.
- Keep checkboxes separate from the flags field → Rejected: contradicts the spec clarification that existing options should be unified into the flags UI.

## R4: Data Flow for Custom Flags

**Decision**: Add a `flags` field to `CreateSessionInput`, the sessions API route, and the `sessions` table (as a TEXT column storing the raw flag string). The session manager parses the flags and merges them into the args passed to `PtySpawner.spawn()`.

**Rationale**: Storing the raw flags in the database enables future features (P4: display flags on session tiles) and provides an audit trail. The session manager is the right place to merge flags with system args because it already handles the `--continue`/`--worktree` logic.

**Alternatives considered**:
- Don't store flags in DB, only use them at spawn time → Rejected: loses the information for display/debugging. The spec's deferred P4 story needs this.
- Store parsed flag array as JSON → Rejected: adds complexity without benefit. The raw string is sufficient and simpler.

## R5: Predefined Flags Configuration

**Decision**: Define predefined flags as a static array in the frontend. Each entry has: `id`, `label`, `flag` (the CLI string or empty for pseudo-flags like "Clean Start"), `description`, and `warningLevel` ("normal" or "caution"). The "Worktree" and "Clean Start" entries are pseudo-flags that map to the existing `worktree` and `startFresh` booleans rather than raw CLI flags.

**Rationale**: Predefined flags are a UI concern — they don't need backend storage or API endpoints. A static frontend array is the simplest approach. The pseudo-flag mapping for worktree/startFresh preserves backward compatibility.

**Alternatives considered**:
- Store predefined flags in the database → Rejected: YAGNI. These are system-defined, not user-configurable.
- Fetch available flags from Claude CLI → Rejected: no such API exists, and adds an external dependency.

## R6: Warning UX for Dangerous Flags

**Decision**: When a predefined flag with `warningLevel: "caution"` is toggled on, show an inline warning message below the flags field. For the MVP, this is limited to `--dangerously-skip-permissions`. The warning text explains that all tool actions will execute without approval. No confirmation dialog — the inline warning is sufficient for MVP.

**Rationale**: The spec requires a warning (FR-008) but doesn't mandate a blocking dialog. An inline warning is less disruptive and consistent with the "flags are for power users" UX philosophy. The flag name itself (`dangerously-`) already signals risk.

**Alternatives considered**:
- Confirmation modal → Rejected: too intrusive for a flag toggle. Power users would find it annoying.
- No warning at all → Rejected: violates FR-008.
