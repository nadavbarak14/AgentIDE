import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { createTestServer, getBaseUrl, type TestServer } from './test-server.js';

// Use paths under $HOME so they pass the isWithinHomeDir() security check
const homeDir = os.homedir();
const testDir = (name: string) => path.join(homeDir, name);

describe('Server Lifecycle', () => {
  let ctx: TestServer;
  let baseUrl: string;

  beforeAll(async () => {
    ctx = await createTestServer();
    baseUrl = getBaseUrl(ctx.port);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('GET /api/settings returns default settings', async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('maxConcurrentSessions');
    expect(data).toHaveProperty('gridLayout');
    expect(data).toHaveProperty('theme');
  });

  it('POST /api/sessions creates a session', async () => {
    const dir = testDir('test-create');
    const res = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory: dir, title: 'System Test' }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toHaveProperty('id');
    expect(data.title).toBe('System Test');
    expect(data.workingDirectory).toBe(dir);
  });

  it('GET /api/sessions lists sessions', async () => {
    const res = await fetch(`${baseUrl}/api/sessions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it('GET /api/sessions?status= filters by status', async () => {
    const res = await fetch(`${baseUrl}/api/sessions?status=active`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    for (const session of data) {
      expect(session.status).toBe('active');
    }
  });

  it('session appears in list after creation', async () => {
    const createRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory: testDir('test-list'), title: 'List Test' }),
    });
    const created = await createRes.json();

    const listRes = await fetch(`${baseUrl}/api/sessions`);
    const sessions = await listRes.json();
    const found = sessions.find((s: { id: string }) => s.id === created.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('List Test');
  });

  it('PATCH /api/settings updates settings', async () => {
    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ maxConcurrentSessions: 5 }),
    });
    expect(patchRes.status).toBe(200);

    const getRes = await fetch(`${baseUrl}/api/settings`);
    const data = await getRes.json();
    expect(data.maxConcurrentSessions).toBe(5);
  });

  it('comments workflow: create and list', async () => {
    // Create a session for comments
    const sessionRes = await fetch(`${baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workingDirectory: testDir('test-comments'), title: 'Comment Test' }),
    });
    const session = await sessionRes.json();

    // Create a comment
    const createRes = await fetch(`${baseUrl}/api/sessions/${session.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: 'test.ts',
        startLine: 1,
        endLine: 1,
        codeSnippet: 'const x = 1',
        commentText: 'test comment',
      }),
    });
    expect(createRes.status).toBe(201);
    const comment = await createRes.json();
    expect(comment.status).toBe('pending');

    // List comments — response is { comments: [...] }
    const listRes = await fetch(`${baseUrl}/api/sessions/${session.id}/comments`);
    expect(listRes.status).toBe(200);
    const body = await listRes.json();
    expect(body.comments.length).toBeGreaterThan(0);
    expect(body.comments[0].commentText).toBe('test comment');
  });
});
