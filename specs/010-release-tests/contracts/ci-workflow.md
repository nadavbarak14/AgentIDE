# CI Workflow Contract: Release Tests

**Feature**: 010-release-tests | **File**: `.github/workflows/ci.yml`

## New Job: `test-release`

```yaml
test-release:
  needs: [lint-typecheck, test-backend, test-frontend, test-system]
  runs-on: ${{ matrix.os }}
  strategy:
    matrix:
      node-version: [20, 22]
      os: [ubuntu-latest, macos-latest]
  steps:
    - checkout
    - setup-node with matrix.node-version
    - npm ci
    - npm run build
    - npm run test:release
    - upload report artifact
```

### Trigger Rules

| Event | Runs? | Notes |
|-------|-------|-------|
| Push to `main` | Yes | Full matrix |
| Pull request | Yes | Full matrix |
| Manual (`workflow_dispatch`) | Yes | Can override tier via input |

### Dependencies

Runs **after** all existing jobs pass:
- `lint-typecheck` — ensures code compiles
- `test-backend` — ensures unit/integration tests pass
- `test-frontend` — ensures frontend tests pass
- `test-system` — ensures system tests pass

### Matrix Coverage

| Node.js | OS | Install Method |
|---------|-----|---------------|
| 20 LTS | ubuntu-latest | global (npm install -g) |
| 20 LTS | macos-latest | global (npm install -g) |
| 22 LTS | ubuntu-latest | global (npm install -g) |
| 22 LTS | macos-latest | global (npm install -g) |

Additional install methods (npx, local) are tested within the install tier tests, not as separate matrix entries.

### Artifacts Uploaded

| Artifact | Path | Retention |
|----------|------|-----------|
| release-test-report-{os}-node{version} | `release-tests/report.json` | 30 days |

### Required Status Check

Add `test-release` to branch protection rules as a required status check for merges to `main`.
