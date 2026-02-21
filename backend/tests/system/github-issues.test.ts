import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { createGitHubRouter } from '../../src/api/routes/github.js';

// Mock the github-cli module so we never invoke the real `gh` binary
vi.mock('../../src/worker/github-cli.js', () => ({
  checkGhStatus: vi.fn(),
  listIssues: vi.fn(),
  getIssueDetail: vi.fn(),
}));

import { checkGhStatus, listIssues, getIssueDetail } from '../../src/worker/github-cli.js';

const mockedCheckGhStatus = vi.mocked(checkGhStatus);
const mockedListIssues = vi.mocked(listIssues);
const mockedGetIssueDetail = vi.mocked(getIssueDetail);

const testProjectDir = path.join(os.homedir(), 'test-project');

describe('GitHub Issues API', () => {
  let app: express.Express;
  let repo: Repository;
  let sessionId: string;

  beforeEach(() => {
    vi.resetAllMocks();

    const db = createTestDb();
    repo = new Repository(db);
    app = express();
    app.use(express.json());
    app.use('/api/sessions', createGitHubRouter(repo));

    // Create a session to use in tests
    const session = repo.createSession({ workingDirectory: testProjectDir, title: 'GH Test' });
    sessionId = session.id;
  });

  afterEach(() => {
    closeDb();
  });

  // ─── GET /api/sessions/:id/github/status ───────────────────

  describe('GET /api/sessions/:id/github/status', () => {
    it('returns 404 for unknown session', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app).get(`/api/sessions/${fakeId}/github/status`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Session not found');
    });

    it('returns gh status for valid session', async () => {
      mockedCheckGhStatus.mockReturnValue({
        ghInstalled: true,
        ghAuthenticated: true,
        repoDetected: true,
        repoOwner: 'acme',
        repoName: 'widgets',
        error: null,
      });

      const res = await request(app).get(`/api/sessions/${sessionId}/github/status`);

      expect(res.status).toBe(200);
      expect(res.body.ghInstalled).toBe(true);
      expect(res.body.ghAuthenticated).toBe(true);
      expect(res.body.repoDetected).toBe(true);
      expect(res.body.repoOwner).toBe('acme');
      expect(res.body.repoName).toBe('widgets');
      expect(res.body.error).toBeNull();
      expect(mockedCheckGhStatus).toHaveBeenCalledWith(testProjectDir);
    });
  });

  // ─── GET /api/sessions/:id/github/issues ───────────────────

  describe('GET /api/sessions/:id/github/issues', () => {
    it('returns issues list', async () => {
      mockedListIssues.mockReturnValue({
        issues: [
          {
            number: 1,
            title: 'Bug report',
            state: 'OPEN',
            labels: [],
            assignees: [],
            author: { login: 'alice', name: 'Alice' },
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-02T00:00:00Z',
            url: 'https://github.com/acme/widgets/issues/1',
          },
        ],
        totalCount: 1,
      });

      const res = await request(app).get(`/api/sessions/${sessionId}/github/issues`);

      expect(res.status).toBe(200);
      expect(res.body.issues).toHaveLength(1);
      expect(res.body.totalCount).toBe(1);
      expect(res.body.issues[0].number).toBe(1);
      expect(mockedListIssues).toHaveBeenCalledWith(testProjectDir, {
        assignee: undefined,
        state: undefined,
        limit: undefined,
        labels: undefined,
        search: undefined,
      });
    });

    it('validates state param', async () => {
      const res = await request(app).get(
        `/api/sessions/${sessionId}/github/issues?state=invalid`,
      );

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid state filter');
      expect(mockedListIssues).not.toHaveBeenCalled();
    });
  });

  // ─── GET /api/sessions/:id/github/issues/:number ──────────

  describe('GET /api/sessions/:id/github/issues/:number', () => {
    it('returns issue detail', async () => {
      mockedGetIssueDetail.mockReturnValue({
        issue: {
          number: 42,
          title: 'Critical bug',
          body: 'Steps to reproduce...',
          state: 'OPEN',
          labels: [{ name: 'bug', color: 'd73a4a', description: '' }],
          assignees: [],
          author: { login: 'alice', name: 'Alice' },
          comments: [
            {
              author: { login: 'bob', name: 'Bob' },
              body: 'Confirmed.',
              createdAt: '2026-01-05T00:00:00Z',
            },
          ],
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-05T00:00:00Z',
          url: 'https://github.com/acme/widgets/issues/42',
        },
      });

      const res = await request(app).get(`/api/sessions/${sessionId}/github/issues/42`);

      expect(res.status).toBe(200);
      expect(res.body.number).toBe(42);
      expect(res.body.title).toBe('Critical bug');
      expect(res.body.body).toBe('Steps to reproduce...');
      expect(res.body.comments).toHaveLength(1);
      expect(mockedGetIssueDetail).toHaveBeenCalledWith(testProjectDir, 42);
    });

    it('returns 400 for invalid number', async () => {
      const res = await request(app).get(`/api/sessions/${sessionId}/github/issues/abc`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid issue number');
      expect(mockedGetIssueDetail).not.toHaveBeenCalled();
    });
  });
});
