# Test Helper Contracts: Release Tests

**Feature**: 010-release-tests | **Dir**: `release-tests/helpers/`

## createReleaseEnvironment()

Creates an isolated test environment that simulates a clean user machine.

```typescript
interface ReleaseEnvironment {
  tempDir: string;          // Root temp directory
  homeDir: string;          // Isolated HOME
  npmPrefix: string;        // npm global prefix
  binDir: string;           // Installed binaries path
  dataDir: string;          // Working dir for c3.db
  env: Record<string, string>; // Environment variables for spawned processes
  cleanup(): Promise<void>; // Remove temp dir and kill any processes
}

async function createReleaseEnvironment(): Promise<ReleaseEnvironment>
```

**Behavior**:
- Creates `os.tmpdir()/agentide-release-XXXXXX/`
- Subdirs: `home/`, `npm-global/`, `data/`
- Sets env: `HOME`, `npm_config_prefix`, `PATH` (prepends binDir)
- `cleanup()` removes the entire temp tree (rm -rf) even on error

## packAndInstall()

Packs the project and installs it in the release environment.

```typescript
interface InstalledArtifact {
  tarballPath: string;
  binaryPath: string;       // Resolved path to agentide binary
  version: string;
}

async function packAndInstall(env: ReleaseEnvironment): Promise<InstalledArtifact>
```

**Behavior**:
1. If `process.env.RELEASE_TARBALL` is set, uses that tarball
2. Otherwise, runs `npm pack` in the project root → produces `c3-dashboard-{version}.tgz`
3. Runs `npm install -g <tarball>` with env's `npm_config_prefix`
4. Verifies `agentide` binary exists at `env.binDir/agentide`
5. Returns paths and version

## startServer()

Starts the installed agentide server and waits for readiness.

```typescript
interface RunningServer {
  process: ChildProcess;
  port: number;
  baseUrl: string;
  stop(): Promise<void>;    // Graceful shutdown (SIGTERM, then SIGKILL after 5s)
}

interface StartOptions {
  env: ReleaseEnvironment;
  binaryPath: string;
  port?: number;             // 0 for ephemeral (default)
  host?: string;             // Default: 127.0.0.1
  tls?: boolean;
  selfSigned?: boolean;
  noAuth?: boolean;
  extraArgs?: string[];
}

async function startServer(opts: StartOptions): Promise<RunningServer>
```

**Behavior**:
1. Spawns `node <binaryPath> start --port <port> [flags]` with env.env
2. Scans stdout+stderr for `"started on http(s)://...:<port>"` regex (same as cli-e2e.test.ts)
3. Resolves actual port from the startup message
4. Times out after 30s if no ready signal
5. `stop()` sends SIGTERM, waits 5s, sends SIGKILL if still alive, waits for exit

## waitForHealth()

Waits for the server health endpoint to respond.

```typescript
async function waitForHealth(
  baseUrl: string,
  timeoutMs?: number  // Default: 10000
): Promise<void>
```

**Behavior**:
- Polls `GET <baseUrl>/api/settings` (or health endpoint) every 500ms
- Resolves when response status is 200 (or 401 in auth-required mode)
- Rejects after timeout

## loadUpgradeFixture()

Copies a versioned DB fixture into the test environment.

```typescript
async function loadUpgradeFixture(
  env: ReleaseEnvironment,
  fixtureVersion: string  // e.g., "v0.1.0"
): Promise<string>        // Path to copied DB file
```

**Behavior**:
1. Copies `release-tests/fixtures/<fixtureVersion>.db` to `env.dataDir/c3.db`
2. Returns the path to the copied file
3. Throws if fixture doesn't exist

## verifyDatabaseIntegrity()

Checks that all tables contain expected data after an upgrade.

```typescript
interface IntegrityResult {
  tableName: string;
  expectedRows: number;
  actualRows: number;
  passed: boolean;
  details?: string;
}

async function verifyDatabaseIntegrity(
  dbPath: string,
  expectedCounts: Record<string, number>
): Promise<IntegrityResult[]>
```

**Behavior**:
- Opens the DB read-only
- For each table, counts rows and compares to expected
- Returns per-table pass/fail results
