# Research: Adyx Frontend Branding

**Feature**: 018-adyx-branding
**Date**: 2026-02-23

## Research Tasks

### RT-001: Locate all "Multy" references in the codebase

**Decision**: Four files contain "Multy" that need updating (excluding worktrees, dist/, and spec files).

**Findings**:

| File | Line | Context | Action |
|------|------|---------|--------|
| `frontend/index.html` | 6 | `<title>Multy</title>` | Replace with "Adyx" |
| `frontend/src/pages/Dashboard.tsx` | 530 | `<h1>Multy</h1>` | Replace with "Adyx" |
| `backend/src/worker-entry.ts` | 15 | `'Multy Worker started...'` log | Replace with "Adyx Worker started..." |
| `frontend/tests/unit/session-grid.test.ts` | 365-385 | Branding tests asserting "Multy" | Update all assertions to "Adyx" |

**Excluded**:
- `frontend/dist/` — build artifact, regenerated automatically
- `.claude/worktrees/` — temporary worktrees, not primary source
- `specs/018-adyx-branding/` — spec files referencing old name for context

**Rationale**: Exhaustive `grep -r "Multy"` across the entire repo confirmed these are the only source-of-truth locations.

### RT-002: Verify "c3" prefix identifiers are safe to keep

**Decision**: All `c3-` prefixed identifiers remain unchanged.

**Rationale**: These are internal code identifiers (localStorage keys like `c3-sidebar-open`, custom events like `c3:input-sent`, the global `C3` bridge object). They are not user-visible and changing them would:
1. Break existing user sessions (localStorage keys would reset)
2. Break event-driven communication between components
3. Require coordinated changes across many files with regression risk

**Alternatives considered**: Full rebrand of internal identifiers was rejected due to high risk and zero user-facing benefit.

### RT-003: Verify "Claude" references should remain

**Decision**: All "Claude" references remain unchanged.

**Rationale**: "Claude" refers to the Anthropic AI product, not the application. UI strings like "Send to Claude", "Show Claude Code", and "Continue with claude -c" are functional descriptions of Claude AI integration, not product branding.

### RT-004: Backend hub entry already uses "Adyx"

**Decision**: `backend/src/hub-entry.ts` already says `Adyx started on http://...` — no change needed.

**Rationale**: Found via grep that line 827 of hub-entry.ts already references "Adyx". Only `worker-entry.ts` still uses "Multy".

## Summary

All NEEDS CLARIFICATION items from the spec have been resolved through codebase research. The change is well-scoped: 4 files, ~10 lines, zero risk of breaking internal functionality.
