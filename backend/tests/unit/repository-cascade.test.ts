import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import Database from 'better-sqlite3';

describe('Repository.deleteSession cascade', () => {
  let repo: Repository;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  function createSessionAndRelatedData(sessionId: string) {
    // Create a completed session (deleteSession only deletes non-active)
    const session = repo.createSession({
      workingDirectory: '/test',
      title: 'Test',
    });
    // Force the id to our known value and mark as completed
    db.prepare('UPDATE sessions SET id = ?, status = ? WHERE id = ?').run(sessionId, 'completed', session.id);

    // Insert related data using raw SQL for simplicity
    db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'c1', sessionId, '/file.ts', 1, 5, 'code', 'a comment', 'open', 'new',
    );
    db.prepare('INSERT INTO preview_comments (id, session_id, comment_text, page_url) VALUES (?, ?, ?, ?)').run(
      'pc1', sessionId, 'preview comment', 'http://localhost:3000',
    );
    db.prepare('INSERT INTO uploaded_images (id, session_id, original_filename, stored_path, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
      'img1', sessionId, 'screenshot.png', '/tmp/img.png', 'image/png', 1024,
    );
    db.prepare('INSERT INTO video_recordings (id, session_id, video_path, status) VALUES (?, ?, ?, ?)').run(
      'vid1', sessionId, '/tmp/video.json', 'completed',
    );
    db.prepare('INSERT INTO panel_states (session_id, state_json) VALUES (?, ?)').run(
      sessionId, '{}',
    );

    return sessionId;
  }

  function countRows(table: string, sessionId: string): number {
    return (db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE session_id = ?`).get(sessionId) as { cnt: number }).cnt;
  }

  it('deletes comments when session is deleted', () => {
    const sid = createSessionAndRelatedData('test-session-1');
    expect(countRows('comments', sid)).toBe(1);
    repo.deleteSession(sid);
    expect(countRows('comments', sid)).toBe(0);
  });

  it('deletes preview_comments when session is deleted', () => {
    const sid = createSessionAndRelatedData('test-session-2');
    expect(countRows('preview_comments', sid)).toBe(1);
    repo.deleteSession(sid);
    expect(countRows('preview_comments', sid)).toBe(0);
  });

  it('deletes uploaded_images when session is deleted', () => {
    const sid = createSessionAndRelatedData('test-session-3');
    expect(countRows('uploaded_images', sid)).toBe(1);
    repo.deleteSession(sid);
    expect(countRows('uploaded_images', sid)).toBe(0);
  });

  it('deletes video_recordings when session is deleted', () => {
    const sid = createSessionAndRelatedData('test-session-4');
    expect(countRows('video_recordings', sid)).toBe(1);
    repo.deleteSession(sid);
    expect(countRows('video_recordings', sid)).toBe(0);
  });

  it('deletes panel_states when session is deleted', () => {
    const sid = createSessionAndRelatedData('test-session-5');
    expect(countRows('panel_states', sid)).toBe(1);
    repo.deleteSession(sid);
    expect(countRows('panel_states', sid)).toBe(0);
  });

  it('does not delete data for other sessions', () => {
    const sid1 = createSessionAndRelatedData('test-session-a');
    const sid2 = createSessionAndRelatedData('test-session-b');

    repo.deleteSession(sid1);

    // sid2 data should be untouched
    expect(countRows('comments', sid2)).toBe(1);
    expect(countRows('preview_comments', sid2)).toBe(1);
    expect(countRows('uploaded_images', sid2)).toBe(1);
    expect(countRows('video_recordings', sid2)).toBe(1);
  });

  it('does not delete data for active sessions', () => {
    const session = repo.createSession({
      workingDirectory: '/test',
      title: 'Active',
    });
    db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'c-active', session.id, '/file.ts', 1, 1, '', 'comment', 'open', 'new',
    );

    const deleted = repo.deleteSession(session.id);
    expect(deleted).toBe(false);
    expect(countRows('comments', session.id)).toBe(1);
  });
});
