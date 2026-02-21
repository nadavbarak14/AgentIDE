import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createAgentFilesRouter, getSessionRegistry } from '../../src/api/routes/agent-files.js';
import { FileWatcher } from '../../src/worker/file-watcher.js';

describe('Remote Agent Routes', () => {
  let app: express.Express;
  let fileWatcher: FileWatcher;
  let tmpDir: string;

  beforeEach(() => {
    // Use $HOME-based paths to pass isWithinHomeDir checks
    tmpDir = fs.mkdtempSync(path.join(os.homedir(), '.c3-agent-test-'));

    // Create some test files in the temp directory
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'Hello, world!\n');
    fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'const x: number = 42;\nexport default x;\n');
    fs.mkdirSync(path.join(tmpDir, 'src'));
    fs.writeFileSync(path.join(tmpDir, 'src', 'index.ts'), 'console.log("hello");\n');

    // Clear the module-level session registry between tests
    getSessionRegistry().clear();

    fileWatcher = new FileWatcher();

    app = express();
    app.use(express.json());
    app.use('/api', createAgentFilesRouter(fileWatcher));
  });

  afterEach(() => {
    fileWatcher.destroy();
    getSessionRegistry().clear();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Helper: register a session ──

  async function registerSession(sessionId: string, workingDirectory?: string, pid?: number) {
    const body: Record<string, unknown> = { workingDirectory: workingDirectory ?? tmpDir };
    if (pid !== undefined) body.pid = pid;
    return request(app)
      .post(`/api/sessions/${sessionId}/register`)
      .send(body);
  }

  // ── 1. GET /api/health ──

  describe('GET /api/health', () => {
    it('returns 200 with status ok and agent flag', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.agent).toBe(true);
      expect(res.body.sessions).toBe(0);
    });

    it('reflects the number of registered sessions', async () => {
      await registerSession('sess-1');
      await registerSession('sess-2');

      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.sessions).toBe(2);
    });
  });

  // ── 2. POST /api/sessions/:id/register ──

  describe('POST /api/sessions/:id/register', () => {
    it('registers a session and returns watching: true', async () => {
      const res = await registerSession('test-session-1');

      expect(res.status).toBe(200);
      expect(res.body.watching).toBe(true);
    });

    it('adds session to the internal registry', async () => {
      await registerSession('test-session-1');

      const registry = getSessionRegistry();
      expect(registry.has('test-session-1')).toBe(true);
      expect(registry.get('test-session-1')?.workingDirectory).toBe(tmpDir);
    });

    it('stores pid when provided', async () => {
      await registerSession('test-session-1', tmpDir, 12345);

      const registry = getSessionRegistry();
      expect(registry.get('test-session-1')?.pid).toBe(12345);
    });

    it('returns 400 when workingDirectory is missing', async () => {
      const res = await request(app)
        .post('/api/sessions/test-session-1/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('workingDirectory');
    });

    it('returns 400 when workingDirectory is not a string', async () => {
      const res = await request(app)
        .post('/api/sessions/test-session-1/register')
        .send({ workingDirectory: 123 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('workingDirectory');
    });

    it('starts file watching for the session', async () => {
      await registerSession('test-session-1');

      expect(fileWatcher.isWatching('test-session-1')).toBe(true);
    });

    it('re-registers a session, replacing the previous registration', async () => {
      const otherDir = fs.mkdtempSync(path.join(os.homedir(), '.c3-agent-test-'));
      try {
        await registerSession('test-session-1', tmpDir);
        await registerSession('test-session-1', otherDir);

        const registry = getSessionRegistry();
        expect(registry.get('test-session-1')?.workingDirectory).toBe(otherDir);
      } finally {
        fs.rmSync(otherDir, { recursive: true, force: true });
      }
    });
  });

  // ── 3. DELETE /api/sessions/:id/register ──

  describe('DELETE /api/sessions/:id/register', () => {
    it('unregisters a session and returns stopped: true', async () => {
      await registerSession('test-session-1');

      const res = await request(app).delete('/api/sessions/test-session-1/register');

      expect(res.status).toBe(200);
      expect(res.body.stopped).toBe(true);
    });

    it('removes session from the internal registry', async () => {
      await registerSession('test-session-1');
      await request(app).delete('/api/sessions/test-session-1/register');

      const registry = getSessionRegistry();
      expect(registry.has('test-session-1')).toBe(false);
    });

    it('stops file watching for the session', async () => {
      await registerSession('test-session-1');
      expect(fileWatcher.isWatching('test-session-1')).toBe(true);

      await request(app).delete('/api/sessions/test-session-1/register');
      expect(fileWatcher.isWatching('test-session-1')).toBe(false);
    });

    it('succeeds even for unregistered sessions', async () => {
      const res = await request(app).delete('/api/sessions/nonexistent/register');

      expect(res.status).toBe(200);
      expect(res.body.stopped).toBe(true);
    });
  });

  // ── 4. GET /api/sessions/:id/files ──

  describe('GET /api/sessions/:id/files', () => {
    it('lists directory entries after registering', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('.');
      expect(Array.isArray(res.body.entries)).toBe(true);

      // Should contain our test files
      const names = res.body.entries.map((e: { name: string }) => e.name);
      expect(names).toContain('hello.txt');
      expect(names).toContain('app.ts');
      expect(names).toContain('src');
    });

    it('lists entries with correct types', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files');

      const srcEntry = res.body.entries.find((e: { name: string }) => e.name === 'src');
      expect(srcEntry?.type).toBe('directory');

      const helloEntry = res.body.entries.find((e: { name: string }) => e.name === 'hello.txt');
      expect(helloEntry?.type).toBe('file');
    });

    it('lists subdirectory when path query is provided', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files?path=src');

      expect(res.status).toBe(200);
      expect(res.body.path).toBe('src');
      const names = res.body.entries.map((e: { name: string }) => e.name);
      expect(names).toContain('index.ts');
    });

    it('returns 400 for directory traversal attempts', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files?path=../etc');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('traversal');
    });

    it('returns 404 for unregistered session', async () => {
      const res = await request(app).get('/api/sessions/nonexistent/files');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });
  });

  // ── 5. GET /api/sessions/:id/files/content ──

  describe('GET /api/sessions/:id/files/content', () => {
    it('reads file content after registering', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files/content?path=hello.txt');

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello, world!\n');
      expect(res.body.language).toBe('plaintext');
      expect(typeof res.body.size).toBe('number');
    });

    it('detects language from extension', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files/content?path=app.ts');

      expect(res.status).toBe(200);
      expect(res.body.language).toBe('typescript');
      expect(res.body.content).toContain('const x: number = 42;');
    });

    it('reads files in subdirectories', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get(
        '/api/sessions/test-session-1/files/content?path=src/index.ts',
      );

      expect(res.status).toBe(200);
      expect(res.body.content).toBe('console.log("hello");\n');
    });

    it('returns 400 when path query is missing', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/files/content');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path');
    });

    it('returns 400 for directory traversal', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get(
        '/api/sessions/test-session-1/files/content?path=../../../etc/passwd',
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('traversal');
    });

    it('returns 404 for nonexistent file', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get(
        '/api/sessions/test-session-1/files/content?path=doesnotexist.txt',
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('returns 404 for unregistered session', async () => {
      const res = await request(app).get(
        '/api/sessions/nonexistent/files/content?path=hello.txt',
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });
  });

  // ── 6. PUT /api/sessions/:id/files/content ──

  describe('PUT /api/sessions/:id/files/content', () => {
    it('writes file content after registering', async () => {
      await registerSession('test-session-1');

      const res = await request(app)
        .put('/api/sessions/test-session-1/files/content')
        .send({ path: 'hello.txt', content: 'Updated content\n' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify on disk
      const onDisk = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
      expect(onDisk).toBe('Updated content\n');
    });

    it('can create a new file', async () => {
      await registerSession('test-session-1');

      const res = await request(app)
        .put('/api/sessions/test-session-1/files/content')
        .send({ path: 'new-file.txt', content: 'Brand new file\n' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const onDisk = fs.readFileSync(path.join(tmpDir, 'new-file.txt'), 'utf-8');
      expect(onDisk).toBe('Brand new file\n');
    });

    it('can write empty content', async () => {
      await registerSession('test-session-1');

      const res = await request(app)
        .put('/api/sessions/test-session-1/files/content')
        .send({ path: 'hello.txt', content: '' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const onDisk = fs.readFileSync(path.join(tmpDir, 'hello.txt'), 'utf-8');
      expect(onDisk).toBe('');
    });

    it('returns 400 when path is missing', async () => {
      await registerSession('test-session-1');

      const res = await request(app)
        .put('/api/sessions/test-session-1/files/content')
        .send({ content: 'some content' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path');
    });

    it('returns 400 when content is missing', async () => {
      await registerSession('test-session-1');

      const res = await request(app)
        .put('/api/sessions/test-session-1/files/content')
        .send({ path: 'hello.txt' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('path');
    });

    it('returns 400 for directory traversal', async () => {
      await registerSession('test-session-1');

      const res = await request(app)
        .put('/api/sessions/test-session-1/files/content')
        .send({ path: '../evil.txt', content: 'hacked' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('traversal');
    });

    it('returns 404 for unregistered session', async () => {
      const res = await request(app)
        .put('/api/sessions/nonexistent/files/content')
        .send({ path: 'hello.txt', content: 'test' });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });
  });

  // ── 7. GET /api/sessions/:id/search ──

  describe('GET /api/sessions/:id/search', () => {
    it('searches files and returns matching results', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get(
        '/api/sessions/test-session-1/search?q=Hello',
      );

      expect(res.status).toBe(200);
      expect(res.body.query).toBe('Hello');
      expect(Array.isArray(res.body.results)).toBe(true);
      expect(res.body.results.length).toBeGreaterThanOrEqual(1);

      const match = res.body.results.find(
        (r: { filePath: string }) => r.filePath === 'hello.txt',
      );
      expect(match).toBeDefined();
      expect(match.lineContent).toContain('Hello');
      expect(typeof match.lineNumber).toBe('number');
    });

    it('returns empty results for no matches', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get(
        '/api/sessions/test-session-1/search?q=zzz_nomatch_zzz',
      );

      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(0);
      expect(res.body.totalMatches).toBe(0);
    });

    it('returns 400 when q parameter is missing', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/search');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('q');
    });

    it('returns 400 when q parameter is empty', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/search?q=');

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('q');
    });

    it('returns 404 for unregistered session', async () => {
      const res = await request(app).get(
        '/api/sessions/nonexistent/search?q=hello',
      );

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });
  });

  // ── 8. GET /api/sessions/:id/diff ──

  describe('GET /api/sessions/:id/diff', () => {
    it('returns diff result for a non-git directory (empty diff)', async () => {
      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/diff');

      expect(res.status).toBe(200);
      expect(res.body.diff).toBe('');
      expect(res.body.stats).toBeDefined();
      expect(res.body.stats.filesChanged).toBe(0);
      expect(res.body.stats.additions).toBe(0);
      expect(res.body.stats.deletions).toBe(0);
    });

    it('returns diff with changes in a git repository', async () => {
      // Initialize a git repo in the temp dir
      const { execSync } = await import('node:child_process');
      execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git add -A', { cwd: tmpDir, stdio: 'pipe' });
      execSync('git commit -m "initial"', { cwd: tmpDir, stdio: 'pipe' });

      // Modify a file to create a diff
      fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'Modified content\n');

      await registerSession('test-session-1');

      const res = await request(app).get('/api/sessions/test-session-1/diff');

      expect(res.status).toBe(200);
      expect(res.body.diff).toContain('hello.txt');
      expect(res.body.stats.filesChanged).toBeGreaterThanOrEqual(1);
    });

    it('returns 404 for unregistered session', async () => {
      const res = await request(app).get('/api/sessions/nonexistent/diff');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });
  });

  // ── 9. Verify 404 for unregistered sessions across all endpoints ──

  describe('unregistered session returns 404', () => {
    const sessionId = 'unregistered-session';

    it('GET /api/sessions/:id/files returns 404', async () => {
      const res = await request(app).get(`/api/sessions/${sessionId}/files`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });

    it('GET /api/sessions/:id/files/content returns 404', async () => {
      const res = await request(app).get(
        `/api/sessions/${sessionId}/files/content?path=hello.txt`,
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });

    it('PUT /api/sessions/:id/files/content returns 404', async () => {
      const res = await request(app)
        .put(`/api/sessions/${sessionId}/files/content`)
        .send({ path: 'hello.txt', content: 'test' });
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });

    it('GET /api/sessions/:id/search returns 404', async () => {
      const res = await request(app).get(
        `/api/sessions/${sessionId}/search?q=hello`,
      );
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });

    it('GET /api/sessions/:id/diff returns 404', async () => {
      const res = await request(app).get(`/api/sessions/${sessionId}/diff`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not registered');
    });
  });
});
