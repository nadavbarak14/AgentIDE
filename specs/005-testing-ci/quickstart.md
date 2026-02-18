# Quickstart: Testing & CI Hardening

## Prerequisites

- Node.js 20 LTS
- npm 10+
- `gh` CLI authenticated (`gh auth status`)
- Repository push access

## Verification Steps

### 1. Coverage Reports (US3)

```bash
# Backend coverage
cd backend && npm run test:coverage
# → Should print text summary + generate coverage/lcov.info
# → Should pass threshold checks (no "Coverage threshold not met" errors)

# Frontend coverage
cd frontend && npm run test:coverage
# → Should print text summary + generate coverage/lcov.info
# → Should pass threshold checks

# Both from root
npm run test:coverage
# → Both workspaces run coverage
```

### 2. CI Pipeline (US2)

```bash
# Push a branch and open a PR
git checkout -b test-ci-verification
git commit --allow-empty -m "test: verify CI pipeline"
git push -u origin test-ci-verification
gh pr create --title "test: CI verification" --body "Temporary PR to verify CI jobs"

# Check GitHub Actions — should see 4 jobs:
# ✓ lint-typecheck
# ✓ test-backend (with coverage artifact)
# ✓ test-frontend (with coverage artifact)
# ✓ test-system

# Clean up
gh pr close --delete-branch
```

### 3. Branch Protection (US1)

```bash
# Verify protection is active
gh api repos/{owner}/{repo}/branches/main/protection --jq '.required_status_checks.contexts'
# → Should list: ["lint-typecheck", "test-backend", "test-frontend"]

# Verify direct push is rejected
git checkout main
git commit --allow-empty -m "test: should be rejected"
git push origin main
# → Should fail with "protected branch" error

# Verify rebase-merge required
gh api repos/{owner}/{repo} --jq '.allow_merge_commit, .allow_squash_merge, .allow_rebase_merge'
# → false, false, true
```

### 4. System Tests (US4)

```bash
# Run system tests
npm run test:system
# → Should start real server, run lifecycle tests, pass

# Or directly
cd backend && npx vitest run --config vitest.system.config.ts
# → All system tests pass with 60s timeout
```

### 5. Frontend Component Tests (US5)

```bash
# Run frontend tests (includes component rendering tests)
npm run test:frontend
# → component tests render SessionCard, DiffViewer header, etc.

cd frontend && npx vitest run
# → All tests pass including new component/ directory
```

### 6. Test Organization (US6)

```bash
# Verify no v*-features files remain
ls frontend/tests/unit/v*.test.ts
# → Should list nothing (all reorganized to module-named files)

# Verify module-named files exist
ls frontend/tests/unit/
# → diff-parser.test.ts, diff-viewer.test.ts, file-viewer.test.ts,
#   session-grid.test.ts, comments.test.ts, api.test.ts, regression.test.ts
# → components/session-card.test.tsx, components/diff-viewer.test.tsx

# Verify all tests pass
npm test && npm run lint
```

## One-Time Setup

### Branch Protection (run once after merging this feature)

```bash
# Make the script executable and run it
chmod +x scripts/setup-branch-protection.sh
./scripts/setup-branch-protection.sh
```

## Troubleshooting

- **Coverage threshold failure**: Run `npm run test:coverage` locally to see which files/metrics are below threshold. Add tests or adjust thresholds if they were set too aggressively.
- **System test port conflict**: Tests use port 0 (random). If flaky, check for zombie processes on the port.
- **Branch protection blocks your PR**: Use admin bypass or temporarily adjust protection rules via `gh api`.
- **CI job `test-system` fails but tests pass locally**: Check that `build-essential` is installed (needed for better-sqlite3 native compilation on Ubuntu).
