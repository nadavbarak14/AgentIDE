import type Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import type {
  Session,
  CreateSessionInput,
  UpdateSessionInput,
  SessionStatus,
  Worker,
  CreateWorkerInput,
  UpdateWorkerInput,
  WorkerStatus,
  Artifact,
  ArtifactType,
  Settings,
  UpdateSettingsInput,
  GridLayout,
  Theme,
  PanelState,
  ActivePanel,
  LeftPanel,
  RightPanel,
  Comment,
  CommentStatus,
  CommentSide,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  PreviewComment,
  CreatePreviewCommentInput,
  PreviewCommentStatus,
  UploadedImage,
  VideoRecording,
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
    worktree: Boolean(row.worktree),
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

function rowToPanelState(row: Record<string, unknown>): PanelState {
  return {
    sessionId: row.session_id as string,
    activePanel: row.active_panel as ActivePanel,
    leftPanel: (row.left_panel as LeftPanel) || 'none',
    rightPanel: (row.right_panel as RightPanel) || 'none',
    leftWidthPercent: (row.left_width_percent as number) ?? 25,
    rightWidthPercent: (row.right_width_percent as number) ?? 35,
    fileTabs: JSON.parse(row.file_tabs as string),
    activeTabIndex: row.active_tab_index as number,
    tabScrollPositions: JSON.parse(row.tab_scroll_positions as string),
    gitScrollPosition: row.git_scroll_position as number,
    previewUrl: row.preview_url as string,
    panelWidthPercent: row.panel_width_percent as number,
    updatedAt: row.updated_at as string,
  };
}

function rowToComment(row: Record<string, unknown>): Comment {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    filePath: row.file_path as string,
    startLine: row.start_line as number,
    endLine: row.end_line as number,
    codeSnippet: row.code_snippet as string,
    commentText: row.comment_text as string,
    status: row.status as CommentStatus,
    side: (row.side as CommentSide) || 'new',
    createdAt: row.created_at as string,
    sentAt: (row.sent_at as string) || null,
  };
}

function rowToProject(row: Record<string, unknown>): Project {
  return {
    id: row.id as string,
    workerId: row.worker_id as string,
    directoryPath: row.directory_path as string,
    displayName: row.display_name as string,
    bookmarked: Boolean(row.bookmarked),
    position: row.position as number | null,
    lastUsedAt: row.last_used_at as string,
    createdAt: row.created_at as string,
  };
}

function rowToPreviewComment(row: Record<string, unknown>): PreviewComment {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    commentText: row.comment_text as string,
    elementSelector: row.element_selector as string | null,
    elementTag: row.element_tag as string | null,
    elementRectJson: row.element_rect_json as string | null,
    screenshotPath: row.screenshot_path as string | null,
    pageUrl: row.page_url as string | null,
    pinX: row.pin_x as number,
    pinY: row.pin_y as number,
    viewportWidth: row.viewport_width as number | null,
    viewportHeight: row.viewport_height as number | null,
    status: row.status as PreviewCommentStatus,
    createdAt: row.created_at as string,
    sentAt: row.sent_at as string | null,
  };
}

function rowToUploadedImage(row: Record<string, unknown>): UploadedImage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    originalFilename: row.original_filename as string,
    storedPath: row.stored_path as string,
    mimeType: row.mime_type as string,
    fileSize: row.file_size as number,
    width: row.width as number | null,
    height: row.height as number | null,
    compressed: Boolean(row.compressed),
    status: row.status as 'pending' | 'sent',
    createdAt: row.created_at as string,
    sentAt: row.sent_at as string | null,
  };
}

function rowToVideoRecording(row: Record<string, unknown>): VideoRecording {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    videoPath: row.video_path as string,
    eventsPath: row.events_path as string | null,
    thumbnailPath: row.thumbnail_path as string | null,
    durationMs: row.duration_ms as number | null,
    fileSize: row.file_size as number | null,
    eventCount: row.event_count as number | null,
    pageUrl: row.page_url as string | null,
    viewportWidth: row.viewport_width as number | null,
    viewportHeight: row.viewport_height as number | null,
    status: (row.status as 'pending' | 'completed') || 'pending',
    createdAt: row.created_at as string,
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
        `INSERT INTO sessions (id, worker_id, status, working_directory, title, position, worktree, created_at, updated_at)
         VALUES (?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.targetWorker || null, input.workingDirectory, input.title, position, input.worktree ? 1 : 0, now, now);

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

  updateWorker(id: string, input: UpdateWorkerInput): Worker | null {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) { updates.push('name = ?'); params.push(input.name); }
    if (input.sshHost !== undefined) { updates.push('ssh_host = ?'); params.push(input.sshHost); }
    if (input.sshPort !== undefined) { updates.push('ssh_port = ?'); params.push(input.sshPort); }
    if (input.sshUser !== undefined) { updates.push('ssh_user = ?'); params.push(input.sshUser); }
    if (input.sshKeyPath !== undefined) { updates.push('ssh_key_path = ?'); params.push(input.sshKeyPath); }
    if (input.maxSessions !== undefined) { updates.push('max_sessions = ?'); params.push(input.maxSessions); }
    if (updates.length === 0) return this.getWorker(id);
    params.push(id);
    this.db.prepare(`UPDATE workers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getWorker(id);
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

  // ─── Panel State ───

  getPanelState(sessionId: string): PanelState | null {
    const row = this.db
      .prepare('SELECT * FROM panel_states WHERE session_id = ?')
      .get(sessionId) as Record<string, unknown> | undefined;
    return row ? rowToPanelState(row) : null;
  }

  savePanelState(
    sessionId: string,
    input: {
      activePanel: ActivePanel;
      leftPanel?: LeftPanel;
      rightPanel?: RightPanel;
      leftWidthPercent?: number;
      rightWidthPercent?: number;
      fileTabs: string[];
      activeTabIndex: number;
      tabScrollPositions: Record<string, { line: number; column: number }>;
      gitScrollPosition: number;
      previewUrl: string;
      panelWidthPercent: number;
    },
  ): void {
    // Preserve enabled_extensions across INSERT OR REPLACE
    const existing = this.db
      .prepare('SELECT enabled_extensions FROM panel_states WHERE session_id = ?')
      .get(sessionId) as { enabled_extensions: string } | undefined;
    const enabledExt = existing?.enabled_extensions || '[]';

    this.db
      .prepare(
        `INSERT OR REPLACE INTO panel_states
         (session_id, active_panel, left_panel, right_panel, left_width_percent, right_width_percent,
          file_tabs, active_tab_index, tab_scroll_positions,
          git_scroll_position, preview_url, panel_width_percent, enabled_extensions, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(
        sessionId,
        input.activePanel,
        input.leftPanel || 'none',
        input.rightPanel || 'none',
        input.leftWidthPercent ?? 25,
        input.rightWidthPercent ?? 35,
        JSON.stringify(input.fileTabs),
        input.activeTabIndex,
        JSON.stringify(input.tabScrollPositions),
        input.gitScrollPosition,
        input.previewUrl,
        input.panelWidthPercent,
        enabledExt,
      );
  }

  deletePanelState(sessionId: string): void {
    this.db.prepare('DELETE FROM panel_states WHERE session_id = ?').run(sessionId);
  }

  // ─── Session Extensions ───

  getSessionExtensions(sessionId: string): string[] {
    const row = this.db
      .prepare('SELECT enabled_extensions FROM panel_states WHERE session_id = ?')
      .get(sessionId) as { enabled_extensions: string } | undefined;
    if (!row) return [];
    try { return JSON.parse(row.enabled_extensions); } catch { return []; }
  }

  setSessionExtensions(sessionId: string, enabled: string[]): void {
    const json = JSON.stringify(enabled);
    // Upsert: if panel_states row exists, update; otherwise insert minimal row
    const existing = this.db.prepare('SELECT 1 FROM panel_states WHERE session_id = ?').get(sessionId);
    if (existing) {
      this.db.prepare("UPDATE panel_states SET enabled_extensions = ?, updated_at = datetime('now') WHERE session_id = ?")
        .run(json, sessionId);
    } else {
      this.db.prepare("INSERT INTO panel_states (session_id, enabled_extensions, updated_at) VALUES (?, ?, datetime('now'))")
        .run(sessionId, json);
    }
  }

  // ─── Comments ───

  createComment(input: {
    sessionId: string;
    filePath: string;
    startLine: number;
    endLine: number;
    codeSnippet: string;
    commentText: string;
    side?: CommentSide;
  }): Comment {
    const id = uuid();
    const side = input.side || 'new';
    this.db
      .prepare(
        `INSERT INTO comments (id, session_id, file_path, start_line, end_line, code_snippet, comment_text, status, side, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))`,
      )
      .run(id, input.sessionId, input.filePath, input.startLine, input.endLine, input.codeSnippet, input.commentText, side);

    const row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as Record<string, unknown>;
    return rowToComment(row);
  }

  getComments(sessionId: string): Comment[] {
    const rows = this.db
      .prepare('SELECT * FROM comments WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToComment);
  }

  getCommentsByStatus(sessionId: string, status: CommentStatus): Comment[] {
    const rows = this.db
      .prepare('SELECT * FROM comments WHERE session_id = ? AND status = ? ORDER BY created_at ASC')
      .all(sessionId, status) as Record<string, unknown>[];
    return rows.map(rowToComment);
  }

  markCommentSent(commentId: string): void {
    this.db
      .prepare("UPDATE comments SET status = 'sent', sent_at = datetime('now') WHERE id = ?")
      .run(commentId);
  }

  updateComment(commentId: string, commentText: string): Comment | null {
    const result = this.db
      .prepare(
        `UPDATE comments SET comment_text = ?
         WHERE id = ? AND status = 'pending'`,
      )
      .run(commentText, commentId);
    if (result.changes === 0) return null;
    const row = this.db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToComment(row) : null;
  }

  deleteComment(commentId: string): boolean {
    const result = this.db
      .prepare("DELETE FROM comments WHERE id = ? AND status = 'pending'")
      .run(commentId);
    return result.changes > 0;
  }

  deleteCommentsByIds(ids: string[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => '?').join(',');
    const result = this.db
      .prepare(`DELETE FROM comments WHERE id IN (${placeholders})`)
      .run(...ids);
    return result.changes;
  }

  // ─── Projects ───

  createProject(input: CreateProjectInput): Project {
    const id = uuid();
    const displayName = input.displayName || input.directoryPath.split('/').pop() || 'Untitled';
    // Upsert: if the worker_id+directory_path pair already exists, update it
    this.db
      .prepare(
        `INSERT INTO projects (id, worker_id, directory_path, display_name, bookmarked, last_used_at, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(worker_id, directory_path) DO UPDATE SET
           display_name = CASE WHEN excluded.display_name != '' THEN excluded.display_name ELSE projects.display_name END,
           bookmarked = excluded.bookmarked,
           last_used_at = datetime('now')`,
      )
      .run(id, input.workerId, input.directoryPath, displayName, input.bookmarked ? 1 : 0);

    // Return the actual row (may be existing row on conflict)
    const row = this.db
      .prepare('SELECT * FROM projects WHERE worker_id = ? AND directory_path = ?')
      .get(input.workerId, input.directoryPath) as Record<string, unknown>;
    return rowToProject(row);
  }

  getProject(id: string): Project | null {
    const row = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToProject(row) : null;
  }

  listProjects(workerId?: string): Project[] {
    let sql: string;
    const params: unknown[] = [];
    if (workerId) {
      sql = `SELECT * FROM projects WHERE worker_id = ?
             ORDER BY bookmarked DESC,
               CASE WHEN bookmarked = 1 THEN position ELSE NULL END ASC,
               last_used_at DESC`;
      params.push(workerId);
    } else {
      sql = `SELECT * FROM projects
             ORDER BY bookmarked DESC,
               CASE WHEN bookmarked = 1 THEN position ELSE NULL END ASC,
               last_used_at DESC`;
    }
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    const projects = rows.map(rowToProject);

    // Limit non-bookmarked (recent) to 10
    const bookmarked = projects.filter((p) => p.bookmarked);
    const recent = projects.filter((p) => !p.bookmarked).slice(0, 10);
    return [...bookmarked, ...recent];
  }

  updateProject(id: string, input: UpdateProjectInput): Project | null {
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.displayName !== undefined) {
      updates.push('display_name = ?');
      params.push(input.displayName);
    }
    if (input.bookmarked !== undefined) {
      updates.push('bookmarked = ?');
      params.push(input.bookmarked ? 1 : 0);
      if (!input.bookmarked) {
        updates.push('position = NULL');
      }
    }
    if (input.position !== undefined) {
      updates.push('position = ?');
      params.push(input.position);
    }
    if (updates.length === 0) return this.getProject(id);

    params.push(id);
    this.db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getProject(id);
  }

  deleteProject(id: string): boolean {
    const result = this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  }

  touchProject(workerId: string, directoryPath: string): Project {
    // Update last_used_at if exists, otherwise create
    const existing = this.db
      .prepare('SELECT * FROM projects WHERE worker_id = ? AND directory_path = ?')
      .get(workerId, directoryPath) as Record<string, unknown> | undefined;

    if (existing) {
      this.db
        .prepare("UPDATE projects SET last_used_at = datetime('now') WHERE id = ?")
        .run(existing.id);
      return this.getProject(existing.id as string)!;
    }

    return this.createProject({ workerId, directoryPath });
  }

  evictOldRecent(maxRecent: number = 10): void {
    // Delete non-bookmarked projects beyond the limit, keeping the most recent
    this.db
      .prepare(
        `DELETE FROM projects WHERE bookmarked = 0 AND id NOT IN (
           SELECT id FROM projects WHERE bookmarked = 0 ORDER BY last_used_at DESC LIMIT ?
         )`,
      )
      .run(maxRecent);
  }

  // ─── Preview Comments ───

  createPreviewComment(sessionId: string, input: CreatePreviewCommentInput): PreviewComment {
    const id = uuid();
    const elementRectJson = input.elementRect ? JSON.stringify(input.elementRect) : null;
    this.db.prepare(
      `INSERT INTO preview_comments (id, session_id, comment_text, element_selector, element_tag, element_rect_json, screenshot_path, page_url, pin_x, pin_y, viewport_width, viewport_height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, sessionId, input.commentText, input.elementSelector || null, input.elementTag || null, elementRectJson, null, input.pageUrl || null, input.pinX, input.pinY, input.viewportWidth || null, input.viewportHeight || null);
    return this.getPreviewComment(id)!;
  }

  getPreviewComment(id: string): PreviewComment | null {
    const row = this.db.prepare('SELECT * FROM preview_comments WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToPreviewComment(row) : null;
  }

  getPreviewComments(sessionId: string): PreviewComment[] {
    const rows = this.db
      .prepare('SELECT * FROM preview_comments WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToPreviewComment);
  }

  getPreviewCommentsByStatus(sessionId: string, status: PreviewCommentStatus): PreviewComment[] {
    const rows = this.db
      .prepare('SELECT * FROM preview_comments WHERE session_id = ? AND status = ? ORDER BY created_at ASC')
      .all(sessionId, status) as Record<string, unknown>[];
    return rows.map(rowToPreviewComment);
  }

  updatePreviewCommentStatus(id: string, status: PreviewCommentStatus): PreviewComment | null {
    this.db.prepare('UPDATE preview_comments SET status = ? WHERE id = ?').run(status, id);
    return this.getPreviewComment(id);
  }

  updatePreviewCommentScreenshotPath(id: string, screenshotPath: string): void {
    this.db
      .prepare('UPDATE preview_comments SET screenshot_path = ? WHERE id = ?')
      .run(screenshotPath, id);
  }

  markPreviewCommentSent(id: string): void {
    this.db
      .prepare("UPDATE preview_comments SET status = 'sent', sent_at = datetime('now') WHERE id = ?")
      .run(id);
  }

  deletePreviewComment(id: string): boolean {
    const result = this.db.prepare('DELETE FROM preview_comments WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deletePreviewCommentsBySession(sessionId: string): number {
    const result = this.db.prepare('DELETE FROM preview_comments WHERE session_id = ?').run(sessionId);
    return result.changes;
  }

  // ─── Uploaded Images ───

  createUploadedImage(input: { sessionId: string; originalFilename: string; storedPath: string; mimeType: string; fileSize: number; width?: number; height?: number; compressed?: boolean }): UploadedImage {
    const id = uuid();
    this.db.prepare(
      `INSERT INTO uploaded_images (id, session_id, original_filename, stored_path, mime_type, file_size, width, height, compressed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.sessionId, input.originalFilename, input.storedPath, input.mimeType, input.fileSize, input.width || null, input.height || null, input.compressed ? 1 : 0);
    return this.getUploadedImage(id)!;
  }

  getUploadedImage(id: string): UploadedImage | null {
    const row = this.db.prepare('SELECT * FROM uploaded_images WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToUploadedImage(row) : null;
  }

  getUploadedImages(sessionId: string, status?: 'pending' | 'sent'): UploadedImage[] {
    if (status) {
      const rows = this.db
        .prepare('SELECT * FROM uploaded_images WHERE session_id = ? AND status = ? ORDER BY created_at ASC')
        .all(sessionId, status) as Record<string, unknown>[];
      return rows.map(rowToUploadedImage);
    }
    const rows = this.db
      .prepare('SELECT * FROM uploaded_images WHERE session_id = ? ORDER BY created_at ASC')
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToUploadedImage);
  }

  markUploadedImageSent(id: string): void {
    this.db
      .prepare("UPDATE uploaded_images SET status = 'sent', sent_at = datetime('now') WHERE id = ?")
      .run(id);
  }

  deleteUploadedImage(id: string): boolean {
    const result = this.db.prepare('DELETE FROM uploaded_images WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ─── Video Recordings ───

  createVideoRecording(input: { sessionId: string; videoPath: string; thumbnailPath?: string; durationMs?: number; fileSize?: number; eventCount?: number; pageUrl?: string; viewportWidth?: number; viewportHeight?: number; status?: 'pending' | 'completed' }): VideoRecording {
    const id = uuid();
    this.db.prepare(
      `INSERT INTO video_recordings (id, session_id, video_path, thumbnail_path, duration_ms, file_size, event_count, page_url, viewport_width, viewport_height, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.sessionId, input.videoPath, input.thumbnailPath || null, input.durationMs || null, input.fileSize || null, input.eventCount || null, input.pageUrl || null, input.viewportWidth || null, input.viewportHeight || null, input.status || 'pending');
    return this.getVideoRecording(id)!;
  }

  getVideoRecording(id: string): VideoRecording | null {
    const row = this.db.prepare('SELECT * FROM video_recordings WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToVideoRecording(row) : null;
  }

  getVideoRecordings(sessionId: string): VideoRecording[] {
    const rows = this.db
      .prepare('SELECT * FROM video_recordings WHERE session_id = ? ORDER BY created_at DESC')
      .all(sessionId) as Record<string, unknown>[];
    return rows.map(rowToVideoRecording);
  }

  deleteVideoRecording(id: string): boolean {
    const result = this.db.prepare('DELETE FROM video_recordings WHERE id = ?').run(id);
    return result.changes > 0;
  }
}
