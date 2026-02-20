# Quickstart: Release Validation Test Suite

**Branch**: `010-release-tests` | **Date**: 2026-02-20

## Prerequisites

- Node.js 20 LTS or later
- npm 10+
- Project cloned and dependencies installed (`npm ci`)

## Run Release Tests Locally

### 1. Build the project first

```bash
npm run build
```

### 2. Run the full release suite

```bash
npm run test:release
```

### 3. Run a specific tier only

```bash
# Fast smoke test (under 5 min)
npm run test:release:smoke

# Installation validation
npm run test:release:install

# End-to-end workflow tests
npm run test:release:e2e

# Upgrade path tests
npm run test:release:upgrade

# CLI config matrix tests
npm run test:release:config
```

### 4. Debug a failing test

```bash
# Keep temp dirs for inspection
RELEASE_KEEP_TEMP=true npm run test:release:smoke

# Temp dirs will be printed in output — inspect the installed files and DB
```

## Project Structure

```
release-tests/
├── vitest.config.ts           # Vitest config (120s timeout, fork pool)
├── helpers/
│   ├── environment.ts         # createReleaseEnvironment()
│   ├── artifact.ts            # packAndInstall()
│   ├── server.ts              # startServer(), waitForHealth()
│   ├── upgrade.ts             # loadUpgradeFixture(), verifyDatabaseIntegrity()
│   └── report.ts              # Test report generation
├── fixtures/
│   └── v0.1.0.db              # Database fixture for upgrade tests
├── smoke/
│   └── critical-path.test.ts  # Smoke: install → start → health → session → stop
├── install/
│   ├── global-install.test.ts # npm install -g from tarball
│   ├── npx-install.test.ts    # npx agentide start
│   └── package-contents.test.ts # Tarball file verification
├── e2e/
│   ├── session-lifecycle.test.ts  # Create, queue, activate, complete sessions
│   ├── terminal-streaming.test.ts # WebSocket terminal I/O
│   ├── file-operations.test.ts    # File viewer and diff viewer
│   └── settings-persistence.test.ts # Settings CRUD and restart persistence
├── upgrade/
│   ├── data-migration.test.ts     # Schema migration + data integrity
│   └── config-preservation.test.ts # Settings + license survive upgrade
└── config/
    ├── port-host.test.ts          # --port and --host options
    ├── tls-options.test.ts        # --tls, --self-signed, --cert, --key
    └── auth-options.test.ts       # --no-auth in remote mode
```

## Adding New Tests

1. Pick the appropriate tier directory
2. Create a `.test.ts` file following existing patterns
3. Use the helpers from `helpers/` for environment setup
4. Each test should clean up after itself (use `afterAll` with `env.cleanup()`)

## Adding Upgrade Fixtures

When a new schema version ships:

1. Check out the version tag
2. Run the fixture generator: `npx tsx release-tests/helpers/generate-fixture.ts --version v0.2.0`
3. Commit the generated `.db` file to `release-tests/fixtures/`
4. Update upgrade tests to include the new fixture

## CI Integration

Release tests run automatically in CI after all other test tiers pass. They run against a matrix of Node.js 20 and 22 on Ubuntu and macOS. See `.github/workflows/ci.yml` for details.
