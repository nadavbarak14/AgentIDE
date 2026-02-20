# Release Test Commands Contract

**Feature**: 010-release-tests | **Base**: npm scripts in root `package.json`

## Run All Release Tests

```bash
npm run test:release
```

Orchestrates all tiers sequentially: smoke → install → e2e → upgrade → config.
Exit code 0 if all pass, non-zero on any failure.

## Run Individual Tiers

| Command | Tier | Timeout | Description |
|---------|------|---------|-------------|
| `npm run test:release:smoke` | Smoke | 5 min | Critical path only: pack → install → start → health → stop |
| `npm run test:release:install` | Install | 10 min | Fresh install validation: global, npx, local methods |
| `npm run test:release:e2e` | E2E | 15 min | Full workflow: sessions, queue, terminal, files, diffs, settings |
| `npm run test:release:upgrade` | Upgrade | 10 min | Version N-1 → N: DB migration, data integrity, config preservation |
| `npm run test:release:config` | Config | 10 min | CLI options matrix: port, host, TLS, self-signed, no-auth |

All commands:
- Accept `--reporter=json` for structured output
- Run in CI without interactive prompts
- Clean up all temp dirs and processes on completion

## Vitest Config

**File**: `release-tests/vitest.config.ts`

```typescript
export default defineConfig({
  test: {
    globals: true,
    include: ['**/*.test.ts'],
    testTimeout: 120000,  // 2 min per test (install/start cycles are slow)
    hookTimeout: 120000,
    pool: 'forks',        // Process isolation for port/env safety
    sequence: {
      concurrent: false,  // Sequential by default (shared port space)
    },
  },
});
```

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `RELEASE_TARBALL` | Path to pre-built tarball (skip pack step) | Auto-generated via `npm pack` |
| `RELEASE_NODE_VERSION` | Override Node.js version check | Current `process.version` |
| `RELEASE_TEST_TIER` | Run specific tier only | All tiers |
| `RELEASE_KEEP_TEMP` | Don't clean up temp dirs (debug) | `false` |

## Test Report Output

**File**: `release-tests/report.json` (generated after run)

```json
{
  "timestamp": "2026-02-20T12:00:00Z",
  "version": "0.1.0",
  "nodeVersion": "20.11.0",
  "os": "linux",
  "tiers": [
    {
      "name": "smoke",
      "passed": 5,
      "failed": 0,
      "skipped": 0,
      "duration": 45000,
      "failures": []
    }
  ],
  "summary": {
    "totalPassed": 42,
    "totalFailed": 0,
    "totalDuration": 180000,
    "result": "PASS"
  }
}
```
