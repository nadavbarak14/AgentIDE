import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ── Server Info ──────────────────────────────────────────────────────────────

interface ServerInfo {
  baseURL: string;
  port: number;
  pid: number;
  dataDir: string;
  tempDir: string;
}

const SERVER_INFO_PATH = path.resolve(import.meta.dirname, '.server-info.json');

export function getServerInfo(): ServerInfo {
  const raw = fs.readFileSync(SERVER_INFO_PATH, 'utf-8');
  return JSON.parse(raw);
}

// ── Session Helpers ──────────────────────────────────────────────────────────

export async function cleanupSessions(baseURL: string): Promise<void> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const res = await fetch(`${baseURL}/api/sessions`);
    if (!res.ok) return;
    const sessions = (await res.json()) as Array<{ id: string; status: string }>;
    if (sessions.length === 0) return;

    // Kill every active session
    await Promise.all(
      sessions
        .filter((s) => s.status === 'active')
        .map((s) =>
          fetch(`${baseURL}/api/sessions/${s.id}/kill`, { method: 'POST' }).catch(() => {}),
        ),
    );

    // Try to delete every non-active session (DELETE returns 409 for active ones)
    await Promise.all(
      sessions
        .filter((s) => s.status !== 'active')
        .map((s) =>
          fetch(`${baseURL}/api/sessions/${s.id}`, { method: 'DELETE' }).catch(() => {}),
        ),
    );

    // Wait for killed sessions to finish dying before next iteration
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

interface CreateSessionOpts {
  title?: string;
  workingDirectory?: string;
  startFresh?: boolean;
}

interface SessionResponse {
  id: string;
  title: string;
  status: string;
  workingDirectory: string;
}

export async function createTestSession(
  baseURL: string,
  opts: CreateSessionOpts = {},
): Promise<SessionResponse> {
  const info = getServerInfo();
  const body = {
    title: opts.title || `Test Session ${Date.now()}`,
    workingDirectory: opts.workingDirectory || info.dataDir,
    // Always use startFresh=true in tests: avoids the --continue retry mechanism
    // which re-spawns Claude on non-zero exit (signal kill) within 30s.
    startFresh: opts.startFresh ?? true,
  };

  const res = await fetch(`${baseURL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create session (${res.status}): ${text}`);
  }

  return res.json() as Promise<SessionResponse>;
}

// ── Git Fixture ──────────────────────────────────────────────────────────────

export interface GitFixture {
  repoPath: string;
  files: Record<string, string>;
  modifications: Record<string, string>;
}

const DEFAULT_FILES: Record<string, string> = {
  'README.md': '# Test Project\n\nOriginal content.\n',
  'src/index.ts': 'export function hello() {\n  return "hello";\n}\n',
  'src/utils.ts': 'export const add = (a: number, b: number) => a + b;\n',
};

const DEFAULT_MODIFICATIONS: Record<string, string> = {
  'README.md': '# Test Project\n\nUpdated content with changes.\n',
  'src/index.ts':
    'export function hello() {\n  return "hello world";\n}\n\nexport function goodbye() {\n  return "goodbye";\n}\n',
};

export function createGitFixture(
  parentDir: string,
  files: Record<string, string> = DEFAULT_FILES,
  modifications: Record<string, string> = DEFAULT_MODIFICATIONS,
): GitFixture {
  const repoPath = path.join(parentDir, `git-fixture-${Date.now()}`);
  fs.mkdirSync(repoPath, { recursive: true });

  const execOpts = { cwd: repoPath, encoding: 'utf-8' as const };

  // Initialize git repo
  execSync('git init', execOpts);
  execSync('git config user.email "test@test.com"', execOpts);
  execSync('git config user.name "Test User"', execOpts);

  // Write initial files and commit
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(repoPath, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  execSync('git add .', execOpts);
  execSync('git commit -m "initial commit"', execOpts);

  // Apply modifications (uncommitted changes)
  for (const [filePath, content] of Object.entries(modifications)) {
    const fullPath = path.join(repoPath, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  return { repoPath, files, modifications };
}

// ── Playwright Test Fixture ──────────────────────────────────────────────────

type BrowserFixtures = {
  serverInfo: ServerInfo;
};

export const test = base.extend<BrowserFixtures>({
  serverInfo: async ({}, use) => {
    const info = getServerInfo();
    await use(info);
  },

  baseURL: async ({}, use) => {
    const info = getServerInfo();
    await use(info.baseURL);
  },
});

export { expect } from '@playwright/test';
