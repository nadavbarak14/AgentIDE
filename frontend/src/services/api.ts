const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Session types (mirrors backend)
export type SessionStatus = 'queued' | 'active' | 'completed' | 'failed';

export interface Session {
  id: string;
  claudeSessionId: string | null;
  workerId: string | null;
  status: SessionStatus;
  workingDirectory: string;
  title: string;
  position: number | null;
  pid: number | null;
  needsInput: boolean;
  lock: boolean;
  continuationCount: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface Worker {
  id: string;
  name: string;
  type: 'local' | 'remote';
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  status: 'connected' | 'disconnected' | 'error';
  maxSessions: number;
  activeSessionCount?: number;
  lastHeartbeat: string | null;
}

export interface Settings {
  maxConcurrentSessions: number;
  maxVisibleSessions: number;
  autoApprove: boolean;
  gridLayout: string;
  theme: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface DiffResult {
  diff: string;
  filesChanged: number;
  additions: number;
  deletions: number;
}

// ─── Sessions ───

export const sessions = {
  list: (status?: SessionStatus) =>
    request<Session[]>(`/sessions${status ? `?status=${status}` : ''}`),

  create: (data: { workingDirectory: string; title: string; targetWorker?: string | null; startFresh?: boolean }) =>
    request<Session & { continued?: boolean }>('/sessions', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { position?: number; title?: string; lock?: boolean }) =>
    request<Session>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),

  continue: (id: string) =>
    request<{ status: string; message: string }>(`/sessions/${id}/continue`, { method: 'POST' }),

  kill: (id: string) =>
    request<{ ok: boolean }>(`/sessions/${id}/kill`, { method: 'POST' }),

  input: (id: string, text: string) =>
    request<{ ok: boolean }>(`/sessions/${id}/input`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
};

// ─── Workers ───

export const workers = {
  list: () => request<Worker[]>('/workers'),

  create: (data: {
    name: string;
    sshHost: string;
    sshPort?: number;
    sshUser: string;
    sshKeyPath: string;
    maxSessions?: number;
  }) => request<Worker>('/workers', { method: 'POST', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/workers/${id}`, { method: 'DELETE' }),

  test: (id: string) =>
    request<{ ok: boolean; latency_ms: number }>(`/workers/${id}/test`, { method: 'POST' }),
};

// ─── Files ───

export const files = {
  tree: (sessionId: string, subpath?: string) =>
    request<{ path: string; entries: FileEntry[] }>(
      `/sessions/${sessionId}/files${subpath ? `?path=${encodeURIComponent(subpath)}` : ''}`,
    ),

  content: (sessionId: string, filePath: string) =>
    request<{ path: string; content: string; language: string; size: number }>(
      `/sessions/${sessionId}/files/content?path=${encodeURIComponent(filePath)}`,
    ),

  diff: (sessionId: string) => request<DiffResult>(`/sessions/${sessionId}/diff`),

  save: (sessionId: string, filePath: string, content: string) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/files/content`, {
      method: 'PUT',
      body: JSON.stringify({ path: filePath, content }),
    }),
};

// ─── Panel State ───

export interface PanelStateData {
  sessionId: string;
  activePanel: 'none' | 'files' | 'git' | 'preview';
  fileTabs: string[];
  activeTabIndex: number;
  tabScrollPositions: Record<string, { line: number; column: number }>;
  gitScrollPosition: number;
  previewUrl: string;
  panelWidthPercent: number;
}

export const panelState = {
  get: (sessionId: string) =>
    request<PanelStateData>(`/sessions/${sessionId}/panel-state`),

  save: (sessionId: string, state: Omit<PanelStateData, 'sessionId'>) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/panel-state`, {
      method: 'PUT',
      body: JSON.stringify(state),
    }),
};

// ─── Comments ───

export interface CommentData {
  id: string;
  sessionId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  commentText: string;
  status: 'pending' | 'sent';
  side: 'old' | 'new';
  createdAt: string;
  sentAt: string | null;
}

export interface CreateCommentInput {
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  commentText: string;
  side?: 'old' | 'new';
}

export const comments = {
  list: (sessionId: string, status?: 'pending' | 'sent') =>
    request<{ comments: CommentData[] }>(
      `/sessions/${sessionId}/comments${status ? `?status=${status}` : ''}`,
    ),

  create: (sessionId: string, data: CreateCommentInput) =>
    request<CommentData>(`/sessions/${sessionId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (sessionId: string, commentId: string, commentText: string) =>
    request<CommentData>(`/sessions/${sessionId}/comments/${commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ commentText }),
    }),

  delete: (sessionId: string, commentId: string) =>
    request<{ success: boolean }>(`/sessions/${sessionId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  deliver: (sessionId: string) =>
    request<{ delivered: string[]; count: number }>(
      `/sessions/${sessionId}/comments/deliver`,
      { method: 'POST' },
    ),

  deliverOne: (sessionId: string, commentId: string) =>
    request<{ delivered: string[]; count: number }>(
      `/sessions/${sessionId}/comments/${commentId}/deliver`,
      { method: 'POST' },
    ),
};

// ─── Directories ───

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface DirectoryListResult {
  path: string;
  entries: DirectoryEntry[];
  exists: boolean;
}

export const directories = {
  list: (dirPath?: string, query?: string) => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    if (query) params.set('query', query);
    return request<DirectoryListResult>(`/directories?${params.toString()}`);
  },

  create: (dirPath: string) =>
    request<{ path: string; created: boolean; exists: boolean }>('/directories', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    }),
};

// ─── Settings ───

export const settings = {
  get: () => request<Settings>('/settings'),
  update: (data: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
};
