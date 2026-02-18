import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Comment Repository', () => {
  let repo: Repository;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('creates a comment with pending status', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'src/App.tsx',
      startLine: 42,
      endLine: 45,
      codeSnippet: 'const count = users.length;',
      commentText: 'Rename this variable',
    });

    expect(comment.id).toBeTruthy();
    expect(comment.sessionId).toBe(session.id);
    expect(comment.filePath).toBe('src/App.tsx');
    expect(comment.startLine).toBe(42);
    expect(comment.endLine).toBe(45);
    expect(comment.codeSnippet).toBe('const count = users.length;');
    expect(comment.commentText).toBe('Rename this variable');
    expect(comment.status).toBe('pending');
    expect(comment.createdAt).toBeTruthy();
    expect(comment.sentAt).toBeNull();
  });

  it('lists comments ordered by creation time', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const c1 = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'line 1',
      commentText: 'First comment',
    });
    const c2 = repo.createComment({
      sessionId: session.id,
      filePath: 'b.ts',
      startLine: 10,
      endLine: 15,
      codeSnippet: 'line 10-15',
      commentText: 'Second comment',
    });

    const comments = repo.getComments(session.id);
    expect(comments).toHaveLength(2);
    expect(comments[0].id).toBe(c1.id);
    expect(comments[1].id).toBe(c2.id);
  });

  it('filters comments by status', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const c1 = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'line 1',
      commentText: 'Pending comment',
    });
    repo.createComment({
      sessionId: session.id,
      filePath: 'b.ts',
      startLine: 5,
      endLine: 5,
      codeSnippet: 'line 5',
      commentText: 'Will be sent',
    });

    // Mark second as sent
    repo.markCommentSent(c1.id);

    const pending = repo.getCommentsByStatus(session.id, 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].commentText).toBe('Will be sent');

    const sent = repo.getCommentsByStatus(session.id, 'sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].commentText).toBe('Pending comment');
  });

  it('marks comment as sent with sentAt timestamp', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Fix this',
    });

    repo.markCommentSent(comment.id);

    const updated = repo.getComments(session.id);
    expect(updated[0].status).toBe('sent');
    expect(updated[0].sentAt).toBeTruthy();
  });

  it('cascades delete when session is deleted', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Comment',
    });

    repo.deleteSession(session.id);
    const comments = repo.getComments(session.id);
    expect(comments).toHaveLength(0);
  });

  // ─── T006: updateComment and deleteComment ───

  it('updateComment changes commentText for pending comment', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 3,
      codeSnippet: 'code',
      commentText: 'Original text',
    });

    const updated = repo.updateComment(comment.id, 'Updated text');
    expect(updated).not.toBeNull();
    expect(updated!.commentText).toBe('Updated text');
    expect(updated!.id).toBe(comment.id);
    expect(updated!.status).toBe('pending');
  });

  it('updateComment fails on sent comment', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Will be sent',
    });
    repo.markCommentSent(comment.id);

    const result = repo.updateComment(comment.id, 'Should fail');
    expect(result).toBeNull();
  });

  it('updateComment fails on non-existent comment', () => {
    const result = repo.updateComment('nonexistent-id', 'Should fail');
    expect(result).toBeNull();
  });

  it('deleteComment removes pending comment', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'To delete',
    });

    const deleted = repo.deleteComment(comment.id);
    expect(deleted).toBe(true);

    const comments = repo.getComments(session.id);
    expect(comments).toHaveLength(0);
  });

  it('deleteComment fails on sent comment', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Sent comment',
    });
    repo.markCommentSent(comment.id);

    const deleted = repo.deleteComment(comment.id);
    expect(deleted).toBe(false);
  });

  // ─── T004: side field tests ───

  it('createComment with side=old stores correctly', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'src/app.ts',
      startLine: 5,
      endLine: 5,
      codeSnippet: 'old code',
      commentText: 'Comment on old side',
      side: 'old',
    });

    expect(comment.side).toBe('old');
    expect(comment.status).toBe('pending');
  });

  it('createComment defaults side to new', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const comment = repo.createComment({
      sessionId: session.id,
      filePath: 'src/app.ts',
      startLine: 10,
      endLine: 10,
      codeSnippet: 'new code',
      commentText: 'Default side comment',
    });

    expect(comment.side).toBe('new');
  });

  it('getComments returns side field', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Old side',
      side: 'old',
    });
    repo.createComment({
      sessionId: session.id,
      filePath: 'b.ts',
      startLine: 2,
      endLine: 2,
      codeSnippet: 'code',
      commentText: 'New side',
      side: 'new',
    });

    const comments = repo.getComments(session.id);
    expect(comments).toHaveLength(2);
    expect(comments[0].side).toBe('old');
    expect(comments[1].side).toBe('new');
  });

  it('getCommentsByStatus returns side field', () => {
    const session = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    repo.createComment({
      sessionId: session.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Pending old',
      side: 'old',
    });

    const pending = repo.getCommentsByStatus(session.id, 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].side).toBe('old');
  });

  it('only returns comments for the specified session', () => {
    const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const s2 = repo.createSession({ workingDirectory: '/p2', title: 'S2' });

    repo.createComment({
      sessionId: s1.id,
      filePath: 'a.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Comment for S1',
    });
    repo.createComment({
      sessionId: s2.id,
      filePath: 'b.ts',
      startLine: 1,
      endLine: 1,
      codeSnippet: 'code',
      commentText: 'Comment for S2',
    });

    const s1Comments = repo.getComments(s1.id);
    expect(s1Comments).toHaveLength(1);
    expect(s1Comments[0].commentText).toBe('Comment for S1');
  });
});
