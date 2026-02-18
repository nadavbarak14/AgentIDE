import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  Session,
  CreateSessionInput,
  UpdateSessionInput,
  SessionStatus,
  Worker,
  CreateWorkerInput,
  WorkerStatus,
  Artifact,
  ArtifactType,
  Settings,
  UpdateSettingsInput,
  GridLayout,
  Theme,
} from './types.js';

// Helper: convert SQLite row to Session
function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    claudeSessionId: row.claude_session_id as string | null,
    workerId: row.worker_id as string | null,
    status: row.status as SessionStatus,
    workingDirectory: row.working_directory as string,
    title: row.title as string,
    position: row.position as number | null,
    pid: row.pid as number | null,
    needsInput: Boolean(row.needs_input),
    lock: Boolean(row.lock),
    continuationCount: row.continuation_count as number,
    terminalScrollback: row.terminal_scrollback as string | null,
    createdAt: row.created_at as string,
    startedAt: row.started_at as string | null,
    completedAt: row.completed_at as string | null,
    updatedAt: row.updated_at as string,
  };
}

function rowToWorker(row: Record<string, unknown>): Worker {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as 'local' | 'remote',
    sshHost: row.ssh_host as string | null,
    sshPort: row.ssh_port as number,
    sshUser: row.ssh_user as string | null,
    sshKeyPath: row.ssh_key_path as string | null,
    status: row.status as WorkerStatus,
    maxSessions: row.max_sessions as number,
    lastHeartbeat: row.last_heartbeat as string | null,
    createdAt: row.created_at as string,
  };
}

function rowToArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    type: row.type as ArtifactType,
    path: row.path as string,
    detectedAt: row.detected_at as string,
  };
}

function rowToSettings(row: Record<string, unknown>): Settings {
  return {
    maxConcurrentSessions: row.max_concurrent_sessions as number,
    maxVisibleSessions: row.max_visible_sessions as number,
    autoApprove: Boolean(row.auto_approve),
    gridLayout: row.grid_layout as GridLayout,
    theme: row.theme as Theme,
  };
}

export class Repository {
  constructor(private db: Database.Database) {}

  // ─── Sessions ───

  createSession(input: CreateSessionInput): Session {
    const id = uuid();
    const now = new Date().toISOString();
    // Get next queue position
    const maxPos = this.db
      .prepare('SELECT MAX(position) as max_pos FROM sessions WHERE status = ?')
      .get('queued') as { max_pos: number | null } | undefined;
    const position = (maxPos?.max_pos ?? 0) + 1;

    this.db
      .prepare(
        `INSERT INTO sessions (id, worker_id, status, working_directory, title, position, created_at, updated_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?)`,
      )
      .run(id, input.targetWorker || null, input.workingDirectory, input.title, position, now, now);

    return this.getSession(id)!;
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToSession(row) : null;
  }

  listSessions(status?: SessionStatus): Session[] {
    let sql = 'SELECT * FROM sessions';
    const params: unknown[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ` ORDER BY
      CASE status
        WHEN 'active' THEN 0
        WHEN 'queued' THEN 1
        WHEN 'completed' THEN 2
        WHEN 'failed' THEN 3
      END,
      CASE WHEN status = 'queued' THEN position ELSE NULL END ASC,
      updated_at DESC`;
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToSession);
  }

  updateSession(id: string, input: UpdateSessionInput): Session | null {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.position !== undefined) {
      updates.push('position = ?');
      params.push(input.position);
    }
    if (input.title !== undefined) {
      updates.push('title = ?');
      params.push(input.title);
    }
    if (input.lock !== undefined) {
      updates.push('lock = ?');
      params.push(input.lock ? 1 : 0);
    }
    if (updates.length === 0) return this.getSession(id);

    updates.push("updated_at = datetime('now')");
    params.push(id);
    this.db.prepare(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getSession(id);
  }

  deleteSession(id: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ? AND status != ?').run(id, 'active');
    return result.changes > 0;
  }

  activateSession(id: string, pid: number): Session | null {
    this.db
      .prepare(
        `UPDATE sessions SET status = 'active', pid = ?, position = NULL,
         started_at = COALESCE(started_at, datetime('now')),
         updated_at = datetime('now'), needs_input = 0
         WHERE id = ?`,
      )
      .run(pid, id);
    return this.getSession(id);
  }

  completeSession(id: string, claudeSessionId: string | null): Session | null {
    this.db
      .prepare(
        `UPDATE sessions SET status = 'completed', pid = NULL,
         claude_session_id = COALESCE(?, claude_session_id),
         completed_at = datetime('now'), updated_at = datetime('now'),
         needs_input = 0
         WHERE id = ?`,
      )
      .run(claudeSessionId, id);
    return this.getSession(id);
  }

  failSession(id: string): Session | null {
    this.db
      .prepare(
        `UPDATE sessions SET status = 'failed', pid = NULL,
         completed_at = datetime('now'), updated_at = datetime('now'),
         needs_input = 0
         WHERE id = ?`,
      )
      .run(id);
    return this.getSession(id);
  }

  queueSessionForContinue(id: string): Session | null {
    const maxPos = this.db
      .prepare('SELECT MAX(position) as max_pos FROM sessions WHERE status = ?')
      .get('queued') as { max_pos: number | null } | undefined;
    const position = (maxPos?.max_pos ?? 0) + 1;
    this.db
      .prepare(
        `UPDATE sessions SET status = 'queued', position = ?,
         continuation_count = continuation_count + 1,
         updated_at = datetime('now')
         WHERE id = ?`,
      )
      .run(position, id);
    return this.getSession(id);
  }

  setClaudeSessionId(id: string, claudeSessionId: string): void {
    this.db
      .prepare("UPDATE sessions SET claude_session_id = ?, updated_at = datetime('now') WHERE id = ?")
      .run(claudeSessionId, id);
  }

  setNeedsInput(id: string, needsInput: boolean): void {
    this.db
      .prepare("UPDATE sessions SET needs_input = ?, updated_at = datetime('now') WHERE id = ?")
      .run(needsInput ? 1 : 0, id);
  }

  getNextQueuedSession(): Session | null {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE status = 'queued' ORDER BY position ASC LIMIT 1")
      .get() as Record<string, unknown> | undefined;
    return row ? rowToSession(row) : null;
  }

  countActiveSessions(): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active'")
      .get() as { count: number };
    return result.count;
  }

  getActiveSessionsOnWorker(workerId: string): number {
    const result = this.db
      .prepare("SELECT COUNT(*) as count FROM sessions WHERE status = 'active' AND worker_id = ?")
      .get(workerId) as { count: number };
    return result.count;
  }

  /**
   * Find the most recent completed session in a directory that has a Claude session ID
   * (i.e., can be continued via claude -c).
   */
  findLatestContinuableSession(workingDirectory: string): Session | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sessions
         WHERE working_directory = ? AND status = 'completed' AND claude_session_id IS NOT NULL
         ORDER BY completed_at DESC LIMIT 1`,
      )
      .get(workingDirectory) as Record<string, unknown> | undefined;
    return row ? rowToSession(row) : null;
  }

  setSessionScrollback(id: string, scrollbackPath: string): void {
    this.db
      .prepare("UPDATE sessions SET terminal_scrollback = ?, updated_at = datetime('now') WHERE id = ?")
      .run(scrollbackPath, id);
  }

  // ─── Workers ───

  createWorker(input: CreateWorkerInput): Worker {
    const id = uuid();
    this.db
      .prepare(
        `INSERT INTO workers (id, name, type, ssh_host, ssh_port, ssh_user, ssh_key_path, max_sessions, status)
         VALUES (?, ?, 'remote', ?, ?, ?, ?, ?, 'disconnected')`,
      )
      .run(
        id,
        input.name,
        input.sshHost,
        input.sshPort ?? 22,
        input.sshUser,
        input.sshKeyPath,
        input.maxSessions ?? 2,
      );
    return this.getWorker(id)!;
  }

  createLocalWorker(name: string, maxSessions: number): Worker {
    const id = uuid();
    this.db
      .prepare(
        `INSERT OR IGNORE INTO workers (id, name, type, status, max_sessions)
         VALUES (?, ?, 'local', 'connected', ?)`,
      )
      .run(id, name, maxSessions);
    // Return existing local worker if one already exists
    const existing = this.getLocalWorker();
    return existing || this.getWorker(id)!;
  }

  getWorker(id: string): Worker | null {
    const row = this.db.prepare('SELECT * FROM workers WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToWorker(row) : null;
  }

  getLocalWorker(): Worker | null {
    const row = this.db.prepare("SELECT * FROM workers WHERE type = 'local' LIMIT 1").get() as
      | Record<string, unknown>
      | undefined;
    return row ? rowToWorker(row) : null;
  }

  listWorkers(): Worker[] {
    const rows = this.db.prepare('SELECT * FROM workers ORDER BY created_at').all() as Record<
      string,
      unknown
    >[];
    return rows.map(rowToWorker);
  }

  deleteWorker(id: string): boolean {
    const result = this.db.prepare('DELETE FROM workers WHERE id = ?').run(id);
    return result.changes > 0;
  }

  updateWorkerStatus(id: string, status: WorkerStatus): void {
    this.db
      .prepare("UPDATE workers SET status = ?, last_heartbeat = datetime('now') WHERE id = ?")
      .run(status, id);
  }

  // ─── Artifacts ───

  createArtifact(sessionId: string, type: ArtifactType, filePath: string): Artifact {
    const id = uuid();
    this.db
      .prepare('INSERT INTO artifacts (id, session_id, type, path) VALUES (?, ?, ?, ?)')
      .run(id, sessionId, type, filePath);
    return this.getArtifact(id)!;
  }

  getArtifact(id: string): Artifact | null {
    const row = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToArtifact(row) : null;
  }

  listArtifacts(sessionId: string): Artifact[] {
    const rows = this.db
      .prepare('SELECT * FROM artifacts WHERE session_id = ? ORDER BY detected_at')
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToArtifact);
  }

  // ─── Settings ───

  getSettings(): Settings {
    const row = this.db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<
      string,
      unknown
    >;
    return rowToSettings(row);
  }

  updateSettings(input: UpdateSettingsInput): Settings {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.maxConcurrentSessions !== undefined) {
      updates.push('max_concurrent_sessions = ?');
      params.push(input.maxConcurrentSessions);
    }
    if (input.maxVisibleSessions !== undefined) {
      updates.push('max_visible_sessions = ?');
      params.push(input.maxVisibleSessions);
    }
    if (input.autoApprove !== undefined) {
      updates.push('auto_approve = ?');
      params.push(input.autoApprove ? 1 : 0);
    }
    if (input.gridLayout !== undefined) {
      updates.push('grid_layout = ?');
      params.push(input.gridLayout);
    }
    if (input.theme !== undefined) {
      updates.push('theme = ?');
      params.push(input.theme);
    }
    if (updates.length > 0) {
      params.push(1);
      this.db.prepare(`UPDATE settings SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    }
    return this.getSettings();
  }
}
