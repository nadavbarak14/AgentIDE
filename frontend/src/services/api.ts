const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
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
export type SessionStatus = 'active' | 'completed' | 'failed';

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
  worktree: boolean;
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
  sshKeyPath: string | null;
  remoteAgentPort: number | null;
  status: 'connected' | 'disconnected' | 'error';
  maxSessions: number;
  activeSessionCount?: number;
  lastHeartbeat: string | null;
}

export interface Project {
  id: string;
  workerId: string;
  directoryPath: string;
  displayName: string;
  bookmarked: boolean;
  position: number | null;
  lastUsedAt: string;
  createdAt: string;
  workerName?: string;
  workerType?: 'local' | 'remote';
  workerStatus?: 'connected' | 'disconnected' | 'error';
}

export interface Settings {
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

export interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchLength: number;
}

// ─── Sessions ───

export const sessions = {
  list: (status?: SessionStatus) =>
    request<Session[]>(`/sessions${status ? `?status=${status}` : ''}`),

  create: (data: { workingDirectory: string; title: string; targetWorker?: string | null; worktree?: boolean; startFresh?: boolean }) =>
    request<Session>('/sessions', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { title?: string; lock?: boolean }) =>
    request<Session>(`/sessions/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/sessions/${id}`, { method: 'DELETE' }),

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
    remoteAgentPort?: number | null;
  }) => request<Worker>('/workers', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: {
    name?: string;
    sshHost?: string;
    sshPort?: number;
    sshUser?: string;
    sshKeyPath?: string;
    maxSessions?: number;
    remoteAgentPort?: number | null;
  }) => request<Worker>(`/workers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/workers/${id}`, { method: 'DELETE' }),

  test: (id: string) =>
    request<{ ok: boolean; latency_ms: number; claudeAvailable?: boolean; claudeVersion?: string; error?: string }>(`/workers/${id}/test`, { method: 'POST' }),

  connect: (id: string) =>
    request<{ ok: boolean; message: string }>(`/workers/${id}/connect`, { method: 'POST' }),

  directories: (workerId: string, dirPath?: string, query?: string) => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    if (query) params.set('query', query);
    const qs = params.toString();
    return request<DirectoryListResult>(`/workers/${workerId}/directories${qs ? `?${qs}` : ''}`);
  },
};

// ─── Projects ───

export const projects = {
  list: (workerId?: string) => {
    const params = new URLSearchParams();
    if (workerId) params.set('workerId', workerId);
    const query = params.toString();
    return request<{ projects: Project[] }>(`/projects${query ? `?${query}` : ''}`);
  },

  create: (data: { workerId: string; directoryPath: string; displayName?: string; bookmarked?: boolean }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: { displayName?: string; bookmarked?: boolean; position?: number | null }) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
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

  search: (sessionId: string, query: string, limit = 100, offset = 0) =>
    request<{ query: string; results: SearchResult[]; totalMatches: number; truncated: boolean }>(
      `/sessions/${sessionId}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`,
    ),
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

// ─── Shell Terminal ───

export type ShellStatus = 'none' | 'running' | 'stopped' | 'killed';

export interface ShellInfo {
  sessionId: string;
  status: ShellStatus;
  pid: number | null;
  shell: string | null;
}

export const shell = {
  open: (sessionId: string, opts?: { cols?: number; rows?: number }) =>
    request<ShellInfo>(`/sessions/${sessionId}/shell`, {
      method: 'POST',
      body: JSON.stringify(opts || {}),
    }),

  close: (sessionId: string) =>
    request<{ sessionId: string; status: string }>(`/sessions/${sessionId}/shell`, {
      method: 'DELETE',
    }),

  status: (sessionId: string) =>
    request<ShellInfo>(`/sessions/${sessionId}/shell`),
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

export interface FileBrowserEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

export interface FileBrowserResult {
  path: string;
  entries: FileBrowserEntry[];
  exists: boolean;
}

export const directories = {
  list: (dirPath?: string, query?: string) => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    if (query) params.set('query', query);
    return request<DirectoryListResult>(`/directories?${params.toString()}`);
  },

  files: (dirPath?: string) => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    return request<FileBrowserResult>(`/directories/files?${params.toString()}`);
  },

  create: (dirPath: string) =>
    request<{ path: string; created: boolean; exists: boolean }>('/directories', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath }),
    }),
};

// ─── GitHub Issues ───

export interface GitHubStatus {
  ghInstalled: boolean;
  ghAuthenticated: boolean;
  repoDetected: boolean;
  repoOwner: string | null;
  repoName: string | null;
  error: string | null;
}

export interface GitHubLabel {
  name: string;
  color: string;
  description: string;
}

export interface GitHubAssignee {
  login: string;
  name: string;
}

export interface GitHubAuthor {
  login: string;
  name: string;
}

export interface GitHubComment {
  author: GitHubAuthor;
  body: string;
  createdAt: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  labels: GitHubLabel[];
  assignees: GitHubAssignee[];
  author: GitHubAuthor;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface GitHubIssueDetail extends GitHubIssue {
  body: string;
  comments: GitHubComment[];
}

export interface GitHubIssueList {
  issues: GitHubIssue[];
  totalCount: number;
  error?: string;
}

export const github = {
  status: (sessionId: string) =>
    request<GitHubStatus>(`/sessions/${sessionId}/github/status`),

  issues: (sessionId: string, params?: {
    assignee?: string;
    state?: 'open' | 'closed' | 'all';
    limit?: number;
    labels?: string;
    search?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.assignee) qs.set('assignee', params.assignee);
    if (params?.state) qs.set('state', params.state);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.labels) qs.set('labels', params.labels);
    if (params?.search) qs.set('search', params.search);
    const query = qs.toString();
    return request<GitHubIssueList>(
      `/sessions/${sessionId}/github/issues${query ? `?${query}` : ''}`,
    );
  },

  issueDetail: (sessionId: string, number: number) =>
    request<GitHubIssueDetail>(`/sessions/${sessionId}/github/issues/${number}`),
};

// ─── Preview Comments ───

export interface PreviewCommentData {
  id: string;
  sessionId: string;
  commentText: string;
  elementSelector: string | null;
  elementTag: string | null;
  elementRectJson: string | null;
  screenshotPath: string | null;
  pageUrl: string | null;
  pinX: number;
  pinY: number;
  viewportWidth: number | null;
  viewportHeight: number | null;
  status: 'pending' | 'sent' | 'stale';
  createdAt: string;
  sentAt: string | null;
}

export interface CreatePreviewCommentInput {
  commentText: string;
  elementSelector?: string;
  elementTag?: string;
  elementRect?: { x: number; y: number; width: number; height: number };
  screenshotDataUrl?: string;
  pageUrl?: string;
  pinX: number;
  pinY: number;
  viewportWidth?: number;
  viewportHeight?: number;
}

export const previewComments = {
  list: (sessionId: string, status?: 'pending' | 'sent' | 'stale') =>
    request<PreviewCommentData[]>(
      `/sessions/${sessionId}/preview-comments${status ? `?status=${status}` : ''}`,
    ),

  create: (sessionId: string, data: CreatePreviewCommentInput) =>
    request<PreviewCommentData>(`/sessions/${sessionId}/preview-comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deliver: (sessionId: string) =>
    request<{ delivered: number; message: string }>(
      `/sessions/${sessionId}/preview-comments/deliver`,
      { method: 'POST' },
    ),

  deliverOne: (sessionId: string, commentId: string) =>
    request<{ delivered: boolean; commentId: string }>(
      `/sessions/${sessionId}/preview-comments/${commentId}/deliver`,
      { method: 'POST' },
    ),

  update: (sessionId: string, commentId: string, status: 'pending' | 'sent' | 'stale') =>
    request<PreviewCommentData>(
      `/sessions/${sessionId}/preview-comments/${commentId}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    ),

  delete: (sessionId: string, commentId: string) =>
    request<void>(
      `/sessions/${sessionId}/preview-comments/${commentId}`,
      { method: 'DELETE' },
    ),
};

// ─── Screenshots ───

export const screenshots = {
  save: (sessionId: string, data: { dataUrl: string; pageUrl?: string; viewportWidth?: number; viewportHeight?: number }) =>
    request<{ id: string; storedPath: string; pageUrl: string; createdAt: string }>(
      `/sessions/${sessionId}/screenshots`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  deliver: (sessionId: string, screenshotId: string, data: { screenshotPath: string; message?: string }) =>
    request<{ delivered: boolean; screenshotId: string }>(
      `/sessions/${sessionId}/screenshots/${screenshotId}/deliver`,
      { method: 'POST', body: JSON.stringify(data) },
    ),
};

// ─── Uploaded Images ───

export const uploadedImages = {
  upload: async (sessionId: string, file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${BASE_URL}/sessions/${sessionId}/upload-image`, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });
    if (!res.ok) {
      if (res.status === 401) window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  list: (sessionId: string, status?: 'pending' | 'sent') =>
    request<Array<{ id: string; originalFilename: string; mimeType: string; fileSize: number; width: number | null; height: number | null; status: string; createdAt: string }>>(
      `/sessions/${sessionId}/uploaded-images${status ? `?status=${status}` : ''}`,
    ),

  deliver: (sessionId: string, imageId: string, message?: string) =>
    request<{ delivered: boolean; imageId: string; deliveredPath: string }>(
      `/sessions/${sessionId}/uploaded-images/${imageId}/deliver`,
      { method: 'POST', body: JSON.stringify({ message }) },
    ),

  getFileUrl: (sessionId: string, imageId: string) =>
    `${BASE_URL}/sessions/${sessionId}/uploaded-images/${imageId}/file`,
};

// ─── Recordings ───

export const recordings = {
  save: (sessionId: string, data: { events: unknown[]; durationMs: number; pageUrl?: string; viewportWidth?: number; viewportHeight?: number; thumbnailDataUrl?: string }) =>
    request<{ id: string; sessionId: string; videoPath: string; eventsPath?: string | null; thumbnailPath: string | null; durationMs: number; eventCount: number; createdAt: string }>(
      `/sessions/${sessionId}/recordings`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  list: (sessionId: string) =>
    request<Array<{ id: string; durationMs: number | null; eventCount: number | null; pageUrl: string | null; thumbnailPath: string | null; createdAt: string }>>(
      `/sessions/${sessionId}/recordings`,
    ),

  get: (sessionId: string, recordingId: string) =>
    request<{ id: string; events: unknown[]; durationMs: number; viewportWidth: number; viewportHeight: number }>(
      `/sessions/${sessionId}/recordings/${recordingId}`,
    ),

  deliver: (sessionId: string, recordingId: string) =>
    request<{ delivered: boolean; recordingId: string }>(
      `/sessions/${sessionId}/recordings/${recordingId}/deliver`,
      { method: 'POST' },
    ),
};

// ─── Settings ───

export const settings = {
  get: () => request<Settings>('/settings'),
  update: (data: Partial<Settings>) =>
    request<Settings>('/settings', { method: 'PATCH', body: JSON.stringify(data) }),
};

