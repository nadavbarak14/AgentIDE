# Data Model: Testing & CI Hardening

**No database schema changes.** This feature is infrastructure-only — CI pipeline, branch protection, coverage configuration, and test files.

## Configuration Entities (non-database)

### 1. Vitest Coverage Configuration

Lives in `vitest.config.ts` in both workspaces (not in database).

```typescript
// backend/vitest.config.ts and frontend/vitest.config.ts
{
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage',
      include: string[],        // Source file globs
      exclude: string[],        // Files to skip
      thresholds: {
        lines: number,          // Minimum line coverage %
        branches: number,       // Minimum branch coverage %
        functions: number,      // Minimum function coverage %
        statements: number,     // Minimum statement coverage %
      }
    }
  }
}
```

### 2. GitHub Branch Protection Rules

Configured via GitHub API (not in database or file). Stored on GitHub servers.

```typescript
// Conceptual schema of the protection rules
{
  required_status_checks: {
    strict: true,               // Branch must be up to date before merge
    contexts: string[],         // CI job names that must pass
  },
  enforce_admins: true,
  required_pull_request_reviews: null,  // Not required (solo dev)
  restrictions: null,
  required_linear_history: true,        // Rebase-merge only
  allow_force_pushes: false,
  allow_deletions: false,
}
```

### 3. CI Workflow Jobs

Lives in `.github/workflows/ci.yml` (YAML, not database).

```typescript
// Conceptual schema of CI jobs
{
  jobs: {
    'lint-typecheck': { needs: [], runs_on: 'ubuntu-latest' },
    'test-backend':   { needs: [], runs_on: 'ubuntu-latest' },
    'test-frontend':  { needs: [], runs_on: 'ubuntu-latest' },
    'test-system':    { needs: ['test-backend'], runs_on: 'ubuntu-latest' },
  }
}
```

## Test Mock Factories (new code, not database)

### Frontend: createMockSession()

```typescript
// frontend/tests/test-utils.ts
function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: 'test-session-1',
    claudeSessionId: null,
    workerId: null,
    status: 'active',
    workingDirectory: '/tmp/test',
    title: 'Test Session',
    position: 1,
    pid: 12345,
    needsInput: false,
    lock: false,
    continuationCount: 0,
    createdAt: '2026-01-01T00:00:00Z',
    startedAt: '2026-01-01T00:00:01Z',
    completedAt: null,
    updatedAt: '2026-01-01T00:00:01Z',
    ...overrides,
  };
}
```

### Frontend: createMockComment()

```typescript
// frontend/tests/test-utils.ts
function createMockComment(overrides?: Partial<CommentData>): CommentData {
  return {
    id: 'test-comment-1',
    sessionId: 'test-session-1',
    filePath: 'src/index.ts',
    startLine: 10,
    endLine: 10,
    codeSnippet: 'const x = 1;',
    commentText: 'Test comment',
    status: 'pending',
    side: 'new',
    createdAt: '2026-01-01T00:00:00Z',
    sentAt: null,
    ...overrides,
  };
}
```
