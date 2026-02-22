// Session status
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
  terminalScrollback: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

export interface CreateSessionInput {
  workingDirectory: string;
  title: string;
  targetWorker?: string | null;
  worktree?: boolean;
}

export interface UpdateSessionInput {
  title?: string;
  lock?: boolean;
}

// Worker
export type WorkerType = 'local' | 'remote';
export type WorkerStatus = 'connected' | 'disconnected' | 'error';

export interface Worker {
  id: string;
  name: string;
  type: WorkerType;
  sshHost: string | null;
  sshPort: number;
  sshUser: string | null;
  sshKeyPath: string | null;
  status: WorkerStatus;
  maxSessions: number;
  lastHeartbeat: string | null;
  createdAt: string;
}

export interface CreateWorkerInput {
  name: string;
  sshHost: string;
  sshPort?: number;
  sshUser: string;
  sshKeyPath: string;
  maxSessions?: number;
}

export interface UpdateWorkerInput {
  name?: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  sshKeyPath?: string;
  maxSessions?: number;
}

// Project
export interface Project {
  id: string;
  workerId: string;
  directoryPath: string;
  displayName: string;
  bookmarked: boolean;
  position: number | null;
  lastUsedAt: string;
  createdAt: string;
}

export interface CreateProjectInput {
  workerId: string;
  directoryPath: string;
  displayName?: string;
  bookmarked?: boolean;
}

export interface UpdateProjectInput {
  displayName?: string;
  bookmarked?: boolean;
  position?: number | null;
}

// Artifact
export type ArtifactType = 'image' | 'pdf' | 'diff' | 'file';

export interface Artifact {
  id: string;
  sessionId: string;
  type: ArtifactType;
  path: string;
  detectedAt: string;
}

// Settings
export type GridLayout = 'auto' | '1x1' | '2x2' | '3x3';
export type Theme = 'dark' | 'light';

export interface Settings {
  maxVisibleSessions: number;
  autoApprove: boolean;
  gridLayout: GridLayout;
  theme: Theme;
}

export interface UpdateSettingsInput {
  maxVisibleSessions?: number;
  autoApprove?: boolean;
  gridLayout?: GridLayout;
  theme?: Theme;
}

// Panel State
export type ActivePanel = 'none' | 'files' | 'git' | 'preview';
export type LeftPanel = 'none' | 'files';
export type RightPanel = 'none' | 'git' | 'preview';
export type PanelContent = 'none' | 'files' | 'git' | 'preview' | 'claude' | 'search' | 'issues';
export type TerminalPosition = 'center' | 'bottom';
export type ViewportMode = 'desktop' | 'mobile' | 'custom';

export interface ScrollPosition {
  line: number;
  column: number;
}

export interface PanelState {
  sessionId: string;
  activePanel: ActivePanel;
  leftPanel: LeftPanel;
  rightPanel: RightPanel;
  leftWidthPercent: number;
  rightWidthPercent: number;
  fileTabs: string[];
  activeTabIndex: number;
  tabScrollPositions: Record<string, ScrollPosition>;
  gitScrollPosition: number;
  previewUrl: string;
  panelWidthPercent: number;
  updatedAt: string;
}

// Comment
export type CommentStatus = 'pending' | 'sent';

export type CommentSide = 'old' | 'new';

export interface Comment {
  id: string;
  sessionId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  codeSnippet: string;
  commentText: string;
  status: CommentStatus;
  side: CommentSide;
  createdAt: string;
  sentAt: string | null;
}

// Shell Terminal
export type ShellStatus = 'none' | 'running' | 'stopped' | 'killed';

export interface ShellInfo {
  sessionId: string;
  status: ShellStatus;
  pid: number | null;
  shell: string | null;
}

export interface WsShellStatusMessage {
  type: 'shell_status';
  sessionId: string;
  status: ShellStatus;
  pid?: number;
  exitCode?: number;
  shell?: string;
}

// Search
export interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchLength: number;
}

// Board Commands (Claude skills for dashboard control)
export type BoardCommandType = 'open_file' | 'show_panel' | 'show_diff' | 'set_preview_resolution';

export interface BoardCommand {
  type: BoardCommandType;
  params: Record<string, string>;
}

// WebSocket message types (Server → Client, text frames)
export type WsServerMessage =
  | WsSessionStatusMessage
  | WsFileChangedMessage
  | WsPortDetectedMessage
  | WsPortClosedMessage
  | WsNeedsInputMessage
  | WsArtifactMessage
  | WsErrorMessage
  | WsBoardCommandMessage;

export interface WsSessionStatusMessage {
  type: 'session_status';
  sessionId: string;
  status: SessionStatus;
  claudeSessionId: string | null;
  pid: number | null;
}

export interface WsFileChangedMessage {
  type: 'file_changed';
  paths: string[];
  timestamp: string;
}

export interface WsPortDetectedMessage {
  type: 'port_detected';
  port: number;
  localPort: number;
  protocol: string;
}

export interface WsPortClosedMessage {
  type: 'port_closed';
  port: number;
}

export interface WsNeedsInputMessage {
  type: 'needs_input';
  sessionId: string;
  needsInput: boolean;
  detectedPattern: string;
  idleSeconds: number;
}

export interface WsArtifactMessage {
  type: 'artifact';
  artifactId: string;
  artifactType: ArtifactType;
  path: string;
  previewUrl: string;
}

export interface WsErrorMessage {
  type: 'error';
  message: string;
  recoverable: boolean;
}

export interface WsBoardCommandMessage {
  type: 'board_command';
  sessionId: string;
  command: BoardCommandType;
  params: Record<string, string>;
}

// WebSocket message types (Client → Server, text frames)
export type WsClientMessage =
  | WsInputMessage
  | WsResizeMessage
  | WsAutoApproveMessage;

export interface WsInputMessage {
  type: 'input';
  data: string;
}

export interface WsResizeMessage {
  type: 'resize';
  cols: number;
  rows: number;
}

export interface WsAutoApproveMessage {
  type: 'auto_approve';
  enabled: boolean;
}

// GitHub Issues (fetched from gh CLI, not persisted)
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

// ─── Preview Visual Feedback ───

export type PreviewCommentStatus = 'pending' | 'sent' | 'stale';

export interface PreviewComment {
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
  status: PreviewCommentStatus;
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

export interface UploadedImage {
  id: string;
  sessionId: string;
  originalFilename: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  compressed: boolean;
  status: 'pending' | 'sent';
  createdAt: string;
  sentAt: string | null;
}

export interface VideoRecording {
  id: string;
  sessionId: string;
  videoPath: string;
  eventsPath: string | null;
  thumbnailPath: string | null;
  durationMs: number | null;
  fileSize: number | null;
  eventCount: number | null;
  pageUrl: string | null;
  viewportWidth: number | null;
  viewportHeight: number | null;
  status: 'pending' | 'completed';
  createdAt: string;
}

export interface GitHubStatus {
  ghInstalled: boolean;
  ghAuthenticated: boolean;
  repoDetected: boolean;
  repoOwner: string | null;
  repoName: string | null;
  error: string | null;
}
