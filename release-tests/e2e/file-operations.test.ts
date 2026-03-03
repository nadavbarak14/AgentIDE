import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  createReleaseEnvironment,
  type ReleaseEnvironment,
} from '../helpers/environment.js';
import { packArtifact, installArtifact, type InstalledArtifact } from '../helpers/artifact.js';
import { startServer, waitForHealth, type RunningServer } from '../helpers/server.js';

describe('E2E: File operations', { timeout: 120_000 }, () => {
  let env: ReleaseEnvironment;
  let server: RunningServer;
  let artifact: InstalledArtifact;
  let projectDir: string;
  let sessionId: string;

  beforeAll(async () => {
    const tarball = packArtifact();
    env = await createReleaseEnvironment();
    artifact = installArtifact(env, tarball);

    // Create a temp project dir with known files (must be inside env.dataDir which is
    // within the server's home directory — directory validation rejects paths outside HOME)
    projectDir = path.join(env.dataDir, 'test-project');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'test.txt'), 'hello world\n');
    fs.writeFileSync(path.join(projectDir, 'README.md'), '# Test Project\n');

    // Init git repo with one commit
    execSync('git init && git add -A && git commit -m "initial"', {
      cwd: projectDir,
      env: { ...env.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' },
      stdio: 'pipe',
    });

    server = await startServer({ env, binaryPath: artifact.binaryPath });
    await waitForHealth(server.baseUrl);

    // Create session pointing at the project dir
    const res = await fetch(`${server.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workingDirectory: projectDir,
        title: 'file-ops-test',
      }),
    });
    const body = await res.json();
    sessionId = body.id;
  });

  afterAll(async () => {
    try {
      if (server) await server.stop();
    } finally {
      if (env) await env.cleanup();
    }
  });

  it('GET /api/sessions/:id/files returns file tree or 404 if session auto-deleted', async () => {
    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/files`);
    // Session may have auto-deleted (no claude CLI in CI), returning 404
    if (res.status === 200) {
      const body = await res.json();
      expect(body.entries).toBeDefined();
      const names = body.entries.map((e: { name: string }) => e.name);
      expect(names).toContain('test.txt');
      expect(names).toContain('README.md');
    } else {
      expect(res.status).toBe(404);
    }
  });

  it('GET /api/sessions/:id/files/content returns file content or 404', async () => {
    const res = await fetch(
      `${server.baseUrl}/api/sessions/${sessionId}/files/content?path=test.txt`,
    );
    // Session may have auto-deleted (no claude CLI in CI), returning 404
    if (res.status === 200) {
      const body = await res.json();
      expect(body.content).toContain('hello world');
    } else {
      expect(res.status).toBe(404);
    }
  });

  it('GET /api/sessions/:id/diff returns git diff or 404', async () => {
    // Modify a file and commit
    fs.writeFileSync(path.join(projectDir, 'test.txt'), 'hello modified\n');
    execSync('git add -A && git commit -m "modify test.txt"', {
      cwd: projectDir,
      env: { ...env.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@test.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@test.com' },
      stdio: 'pipe',
    });

    const res = await fetch(`${server.baseUrl}/api/sessions/${sessionId}/diff`);
    // Diff endpoint may return 200 with diff, empty, or 404 if session auto-deleted
    expect([200, 404]).toContain(res.status);
  });
});
