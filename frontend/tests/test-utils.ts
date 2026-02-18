import type { Session, CommentData } from '../src/services/api';

export function createMockSession(overrides?: Partial<Session>): Session {
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

export function createMockComment(overrides?: Partial<CommentData>): CommentData {
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
