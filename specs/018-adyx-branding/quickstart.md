# Quickstart: Adyx Frontend Branding

**Feature**: 018-adyx-branding
**Date**: 2026-02-23

## What This Feature Does

Replaces all user-visible instances of the old product name "Multy" with the new name "Adyx" across the frontend and backend.

## Files to Change

1. **`frontend/index.html`** — Browser tab title: `Multy` → `Adyx`
2. **`frontend/src/pages/Dashboard.tsx`** — Dashboard header `<h1>`: `Multy` → `Adyx`
3. **`backend/src/worker-entry.ts`** — Worker startup log message: `Multy Worker` → `Adyx Worker`
4. **`frontend/tests/unit/session-grid.test.ts`** — Update branding tests to assert "Adyx"

## What NOT to Change

- `c3-` prefixed localStorage keys, custom events, or the `C3` bridge object (internal identifiers)
- "Claude" references (third-party AI product name)
- `c3-frontend` in `package.json` (developer tooling identifier)
- `frontend/dist/` (auto-generated build output)

## Verification

```bash
# Run existing tests (should pass after updates)
npm test

# Verify no "Multy" remains in source (excluding specs and worktrees)
grep -r "Multy" frontend/src/ frontend/index.html backend/src/
# Expected: zero results

# Verify "Adyx" appears where expected
grep -r "Adyx" frontend/src/ frontend/index.html backend/src/
# Expected: index.html title, Dashboard.tsx header, worker-entry.ts log
```
