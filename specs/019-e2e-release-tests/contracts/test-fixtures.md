# Test Fixture Contracts

**Branch**: `019-e2e-release-tests` | **Date**: 2026-02-23

Since this feature adds tests (not APIs), this document defines the contracts between test fixtures, helpers, and test files.

## Playwright Fixture: `serverFixture`

Provides a running server instance to all browser tests.

### Interface

```typescript
// Defined in release-tests/browser/fixtures.ts

interface ServerFixture {
  baseURL: string;       // e.g., "http://127.0.0.1:54321"
  env: ReleaseEnvironment;
  artifact: InstalledArtifact;
  server: RunningServer;
}
```

### Lifecycle

- **globalSetup**: `packArtifact()` → `createReleaseEnvironment()` → `installArtifact()` → `startServer()` → `waitForHealth()` → write `baseURL` to `.server-info.json`
- **globalTeardown**: `server.stop()` → `env.cleanup()` → remove `.server-info.json`
- **Tests**: Read `baseURL` from `.server-info.json` via Playwright `use.baseURL`

## Playwright Fixture: `gitFixture`

Creates a temporary git repo with known changes for diff tests.

### Interface

```typescript
// Defined in release-tests/browser/fixtures.ts

interface GitFixture {
  repoPath: string;
  files: Record<string, string>;       // initial committed files
  modifications: Record<string, string>; // uncommitted changes
}
```

### Setup Procedure

1. Create temp directory inside server's `dataDir`
2. `git init`
3. Write `files` to disk, `git add .`, `git commit -m "initial"`
4. Write `modifications` to disk (overwrite existing files)
5. Return `{ repoPath, files, modifications }`

### Default Fixture

```typescript
const DEFAULT_GIT_FIXTURE = {
  files: {
    'README.md': '# Test Project\n\nOriginal content.\n',
    'src/index.ts': 'export function hello() {\n  return "hello";\n}\n',
    'src/utils.ts': 'export const add = (a: number, b: number) => a + b;\n',
  },
  modifications: {
    'README.md': '# Test Project\n\nUpdated content with changes.\n',
    'src/index.ts': 'export function hello() {\n  return "hello world";\n}\n\nexport function goodbye() {\n  return "goodbye";\n}\n',
  },
};
```

## Test Cleanup Contract

Each test file must clean up sessions it creates to maintain isolation:

```typescript
// In each test file's beforeEach or afterEach
async function cleanupSessions(baseURL: string) {
  const res = await fetch(`${baseURL}/api/sessions`);
  const sessions = await res.json();
  for (const session of sessions) {
    await fetch(`${baseURL}/api/sessions/${session.id}`, { method: 'DELETE' });
  }
}
```

## NPM Script Contract

```json
{
  "test:release:browser": "npx playwright test --config release-tests/browser/playwright.config.ts",
  "test:release:all": "npm run test:release && npm run test:release:browser"
}
```

## Playwright Configuration Contract

```typescript
// release-tests/browser/playwright.config.ts
{
  testDir: './release-tests/browser',
  timeout: 60_000,          // 60s per test
  globalSetup: './release-tests/browser/global-setup.ts',
  globalTeardown: './release-tests/browser/global-teardown.ts',
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
}
```
