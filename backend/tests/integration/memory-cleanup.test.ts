import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb, closeDb } from '../../src/models/db.js';
import { Repository } from '../../src/models/repository.js';
import { PreviewCookieJar } from '../../src/api/preview-proxy.js';
import Database from 'better-sqlite3';

describe('Memory cleanup integration: full session lifecycle', () => {
  let repo: Repository;
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    repo = new Repository(db);
  });

  afterEach(() => {
    closeDb();
  });

  it('all session-scoped resources are cleaned up after session deletion', () => {
    // 1. Create a session and populate all related tables
    const session = repo.createSession({
      workingDirectory: '/test/project',
      title: 'Integration Test Session',
    });
    const sessionId = session.id;

    // Mark as completed so it can be deleted
    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('completed', sessionId);

    // Populate related DB tables
    db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'c1', sessionId, '/src/app.ts', 10, 20, 'function foo() {}', 'refactor this', 'open', 'new',
    );
    db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'c2', sessionId, '/src/bar.ts', 5, 5, 'const x = 1;', 'rename this', 'open', 'new',
    );
    db.prepare('INSERT INTO preview_comments (id, session_id, comment_text, page_url) VALUES (?, ?, ?, ?)').run(
      'pc1', sessionId, 'button is misaligned', 'http://localhost:3000',
    );
    db.prepare('INSERT INTO uploaded_images (id, session_id, original_filename, stored_path, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?)').run(
      'img1', sessionId, 'bug.png', '/tmp/img1.png', 'image/png', 2048,
    );
    db.prepare('INSERT INTO video_recordings (id, session_id, video_path, status) VALUES (?, ?, ?, ?)').run(
      'vid1', sessionId, '/tmp/rec1.json', 'pending',
    );
    db.prepare('INSERT INTO panel_states (session_id, state_json) VALUES (?, ?)').run(
      sessionId, '{"layout": "split"}',
    );

    // 2. Simulate in-memory stores (widgetStore and cookieJar)
    const widgetStore = new Map<string, Map<string, { html: string }>>();
    const sessionWidgets = new Map<string, { html: string }>();
    sessionWidgets.set('my-widget', { html: '<div>Widget</div>' });
    widgetStore.set(sessionId, sessionWidgets);

    const cookieJar = new PreviewCookieJar();
    cookieJar.store(sessionId, 3000, 'token=abc123');
    cookieJar.store(sessionId, 5173, 'session=xyz');

    // 3. Verify everything exists before cleanup
    const countRows = (table: string) =>
      (db.prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE session_id = ?`).get(sessionId) as { cnt: number }).cnt;

    expect(countRows('comments')).toBe(2);
    expect(countRows('preview_comments')).toBe(1);
    expect(countRows('uploaded_images')).toBe(1);
    expect(countRows('video_recordings')).toBe(1);
    expect(countRows('panel_states')).toBe(1);
    expect(widgetStore.has(sessionId)).toBe(true);
    expect(cookieJar.size()).toBe(2);

    // 4. Simulate session completion cleanup (same as hub-entry.ts handlers)
    widgetStore.delete(sessionId);
    cookieJar.clear(sessionId);
    repo.deleteSession(sessionId);

    // 5. Verify EVERYTHING is cleaned up
    expect(countRows('comments')).toBe(0);
    expect(countRows('preview_comments')).toBe(0);
    expect(countRows('uploaded_images')).toBe(0);
    expect(countRows('video_recordings')).toBe(0);
    expect(countRows('panel_states')).toBe(0);
    expect(widgetStore.has(sessionId)).toBe(false);
    expect(cookieJar.size()).toBe(0);

    // Session record itself should also be gone
    expect(repo.getSession(sessionId)).toBeNull();
  });

  it('cleanup of one session does not affect another', () => {
    const s1 = repo.createSession({ workingDirectory: '/p1', title: 'S1' });
    const s2 = repo.createSession({ workingDirectory: '/p2', title: 'S2' });

    db.prepare('UPDATE sessions SET status = ? WHERE id = ?').run('completed', s1.id);

    // Add data to both sessions
    db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'c-s1', s1.id, '/f.ts', 1, 1, '', 'comment', 'open', 'new',
    );
    db.prepare('INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'c-s2', s2.id, '/f.ts', 1, 1, '', 'comment', 'open', 'new',
    );

    const cookieJar = new PreviewCookieJar();
    cookieJar.store(s1.id, 3000, 'a=1');
    cookieJar.store(s2.id, 3000, 'b=2');

    // Delete s1
    cookieJar.clear(s1.id);
    repo.deleteSession(s1.id);

    // s2 should be untouched
    const s2Comments = (db.prepare('SELECT COUNT(*) as cnt FROM comments WHERE session_id = ?').get(s2.id) as { cnt: number }).cnt;
    expect(s2Comments).toBe(1);
    expect(cookieJar.get(s2.id, 3000)).toBe('b=2');
    expect(cookieJar.size()).toBe(1);
  });
});
