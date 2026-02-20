import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';

describe('Preview Comments Repository', () => {
  let repo: Repository;
  let sessionId: string;

  beforeEach(() => {
    const db = createTestDb();
    repo = new Repository(db);
    const session = repo.createSession({ workingDirectory: '/tmp/test', title: 'Test' });
    sessionId = session.id;
  });

  afterEach(() => {
    closeDb();
  });

  // ─── Create ───

  it('creates a preview comment with full input', () => {
    const comment = repo.createPreviewComment(sessionId, {
      commentText: 'Button looks misaligned',
      elementSelector: '#submit-btn',
      elementTag: 'button',
      elementRect: { x: 100, y: 200, width: 150, height: 40 },
      pageUrl: 'http://localhost:3000/form',
      pinX: 175,
      pinY: 220,
      viewportWidth: 1920,
      viewportHeight: 1080,
    });

    expect(comment.id).toBeTruthy();
    expect(comment.sessionId).toBe(sessionId);
    expect(comment.commentText).toBe('Button looks misaligned');
    expect(comment.elementSelector).toBe('#submit-btn');
    expect(comment.elementTag).toBe('button');
    expect(comment.elementRectJson).toBe(JSON.stringify({ x: 100, y: 200, width: 150, height: 40 }));
    expect(comment.screenshotPath).toBeNull();
    expect(comment.pageUrl).toBe('http://localhost:3000/form');
    expect(comment.pinX).toBe(175);
    expect(comment.pinY).toBe(220);
    expect(comment.viewportWidth).toBe(1920);
    expect(comment.viewportHeight).toBe(1080);
    expect(comment.status).toBe('pending');
    expect(comment.createdAt).toBeTruthy();
    expect(comment.sentAt).toBeNull();
  });

  it('creates a preview comment with minimal input', () => {
    const comment = repo.createPreviewComment(sessionId, {
      commentText: 'Something is off here',
      pinX: 50,
      pinY: 75,
    });

    expect(comment.id).toBeTruthy();
    expect(comment.sessionId).toBe(sessionId);
    expect(comment.commentText).toBe('Something is off here');
    expect(comment.elementSelector).toBeNull();
    expect(comment.elementTag).toBeNull();
    expect(comment.elementRectJson).toBeNull();
    expect(comment.screenshotPath).toBeNull();
    expect(comment.pageUrl).toBeNull();
    expect(comment.pinX).toBe(50);
    expect(comment.pinY).toBe(75);
    expect(comment.viewportWidth).toBeNull();
    expect(comment.viewportHeight).toBeNull();
    expect(comment.status).toBe('pending');
    expect(comment.sentAt).toBeNull();
  });

  // ─── Get by ID ───

  it('retrieves a preview comment by id', () => {
    const created = repo.createPreviewComment(sessionId, {
      commentText: 'Check this element',
      pinX: 10,
      pinY: 20,
      pageUrl: 'http://localhost:3000/',
    });

    const fetched = repo.getPreviewComment(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.commentText).toBe('Check this element');
    expect(fetched!.pinX).toBe(10);
    expect(fetched!.pinY).toBe(20);
    expect(fetched!.pageUrl).toBe('http://localhost:3000/');
  });

  it('returns null for non-existent preview comment id', () => {
    const result = repo.getPreviewComment('nonexistent-id');
    expect(result).toBeNull();
  });

  // ─── List by session ───

  it('lists all preview comments for a session in creation order', () => {
    const c1 = repo.createPreviewComment(sessionId, {
      commentText: 'First comment',
      pinX: 10,
      pinY: 10,
    });
    const c2 = repo.createPreviewComment(sessionId, {
      commentText: 'Second comment',
      pinX: 20,
      pinY: 20,
    });
    const c3 = repo.createPreviewComment(sessionId, {
      commentText: 'Third comment',
      pinX: 30,
      pinY: 30,
    });

    const comments = repo.getPreviewComments(sessionId);
    expect(comments).toHaveLength(3);
    expect(comments[0].id).toBe(c1.id);
    expect(comments[1].id).toBe(c2.id);
    expect(comments[2].id).toBe(c3.id);
  });

  it('returns empty array for session with no preview comments', () => {
    const comments = repo.getPreviewComments(sessionId);
    expect(comments).toHaveLength(0);
  });

  it('only returns preview comments for the specified session', () => {
    const session2 = repo.createSession({ workingDirectory: '/tmp/test2', title: 'Test 2' });

    repo.createPreviewComment(sessionId, {
      commentText: 'Comment for session 1',
      pinX: 10,
      pinY: 10,
    });
    repo.createPreviewComment(session2.id, {
      commentText: 'Comment for session 2',
      pinX: 20,
      pinY: 20,
    });

    const s1Comments = repo.getPreviewComments(sessionId);
    expect(s1Comments).toHaveLength(1);
    expect(s1Comments[0].commentText).toBe('Comment for session 1');

    const s2Comments = repo.getPreviewComments(session2.id);
    expect(s2Comments).toHaveLength(1);
    expect(s2Comments[0].commentText).toBe('Comment for session 2');
  });

  // ─── List by status ───

  it('filters preview comments by pending status', () => {
    const c1 = repo.createPreviewComment(sessionId, {
      commentText: 'Pending comment',
      pinX: 10,
      pinY: 10,
    });
    const c2 = repo.createPreviewComment(sessionId, {
      commentText: 'Will be sent',
      pinX: 20,
      pinY: 20,
    });
    const c3 = repo.createPreviewComment(sessionId, {
      commentText: 'Also pending',
      pinX: 30,
      pinY: 30,
    });

    repo.markPreviewCommentSent(c2.id);

    const pending = repo.getPreviewCommentsByStatus(sessionId, 'pending');
    expect(pending).toHaveLength(2);
    expect(pending[0].id).toBe(c1.id);
    expect(pending[1].id).toBe(c3.id);
  });

  it('filters preview comments by sent status', () => {
    const c1 = repo.createPreviewComment(sessionId, {
      commentText: 'Will be sent',
      pinX: 10,
      pinY: 10,
    });
    repo.createPreviewComment(sessionId, {
      commentText: 'Stays pending',
      pinX: 20,
      pinY: 20,
    });

    repo.markPreviewCommentSent(c1.id);

    const sent = repo.getPreviewCommentsByStatus(sessionId, 'sent');
    expect(sent).toHaveLength(1);
    expect(sent[0].commentText).toBe('Will be sent');
  });

  it('filters preview comments by stale status', () => {
    const c1 = repo.createPreviewComment(sessionId, {
      commentText: 'Will go stale',
      pinX: 10,
      pinY: 10,
    });
    repo.createPreviewComment(sessionId, {
      commentText: 'Stays pending',
      pinX: 20,
      pinY: 20,
    });

    repo.updatePreviewCommentStatus(c1.id, 'stale');

    const stale = repo.getPreviewCommentsByStatus(sessionId, 'stale');
    expect(stale).toHaveLength(1);
    expect(stale[0].commentText).toBe('Will go stale');
  });

  // ─── Update status ───

  it('updates preview comment status to stale', () => {
    const comment = repo.createPreviewComment(sessionId, {
      commentText: 'Going stale',
      pinX: 10,
      pinY: 10,
    });

    const updated = repo.updatePreviewCommentStatus(comment.id, 'stale');
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(comment.id);
    expect(updated!.status).toBe('stale');
  });

  it('updates preview comment status to sent', () => {
    const comment = repo.createPreviewComment(sessionId, {
      commentText: 'Going sent via status update',
      pinX: 10,
      pinY: 10,
    });

    const updated = repo.updatePreviewCommentStatus(comment.id, 'sent');
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('sent');
  });

  it('returns null when updating status of non-existent comment', () => {
    const result = repo.updatePreviewCommentStatus('nonexistent-id', 'stale');
    expect(result).toBeNull();
  });

  // ─── Mark sent ───

  it('marks preview comment as sent with sentAt timestamp', () => {
    const comment = repo.createPreviewComment(sessionId, {
      commentText: 'Will be sent',
      pinX: 10,
      pinY: 10,
    });

    expect(comment.sentAt).toBeNull();
    expect(comment.status).toBe('pending');

    repo.markPreviewCommentSent(comment.id);

    const updated = repo.getPreviewComment(comment.id);
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe('sent');
    expect(updated!.sentAt).toBeTruthy();
  });

  // ─── Delete ───

  it('deletes a preview comment and returns true', () => {
    const comment = repo.createPreviewComment(sessionId, {
      commentText: 'To be deleted',
      pinX: 10,
      pinY: 10,
    });

    const deleted = repo.deletePreviewComment(comment.id);
    expect(deleted).toBe(true);

    const fetched = repo.getPreviewComment(comment.id);
    expect(fetched).toBeNull();
  });

  it('returns false when deleting non-existent preview comment', () => {
    const deleted = repo.deletePreviewComment('nonexistent-id');
    expect(deleted).toBe(false);
  });

  // ─── Delete by session ───

  it('deletes all preview comments for a session and returns count', () => {
    repo.createPreviewComment(sessionId, {
      commentText: 'Comment 1',
      pinX: 10,
      pinY: 10,
    });
    repo.createPreviewComment(sessionId, {
      commentText: 'Comment 2',
      pinX: 20,
      pinY: 20,
    });
    repo.createPreviewComment(sessionId, {
      commentText: 'Comment 3',
      pinX: 30,
      pinY: 30,
    });

    const deletedCount = repo.deletePreviewCommentsBySession(sessionId);
    expect(deletedCount).toBe(3);

    const remaining = repo.getPreviewComments(sessionId);
    expect(remaining).toHaveLength(0);
  });

  it('returns 0 when deleting preview comments for session with none', () => {
    const deletedCount = repo.deletePreviewCommentsBySession(sessionId);
    expect(deletedCount).toBe(0);
  });

  it('only deletes preview comments for the specified session', () => {
    const session2 = repo.createSession({ workingDirectory: '/tmp/test2', title: 'Test 2' });

    repo.createPreviewComment(sessionId, {
      commentText: 'Session 1 comment',
      pinX: 10,
      pinY: 10,
    });
    repo.createPreviewComment(session2.id, {
      commentText: 'Session 2 comment',
      pinX: 20,
      pinY: 20,
    });

    const deletedCount = repo.deletePreviewCommentsBySession(sessionId);
    expect(deletedCount).toBe(1);

    const s1Comments = repo.getPreviewComments(sessionId);
    expect(s1Comments).toHaveLength(0);

    const s2Comments = repo.getPreviewComments(session2.id);
    expect(s2Comments).toHaveLength(1);
    expect(s2Comments[0].commentText).toBe('Session 2 comment');
  });
});
