// Session status — sessions ARE the queue, no separate task entity
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
}

export interface UpdateSessionInput {
  position?: number;
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
  maxConcurrentSessions: number;
  maxVisibleSessions: number;
  autoApprove: boolean;
  gridLayout: GridLayout;
  theme: Theme;
}

export interface UpdateSettingsInput {
  maxConcurrentSessions?: number;
  maxVisibleSessions?: number;
  autoApprove?: boolean;
  gridLayout?: GridLayout;
  theme?: Theme;
}

// Panel State
export type ActivePanel = 'none' | 'files' | 'git' | 'preview';
export type LeftPanel = 'none' | 'files';
export type RightPanel = 'none' | 'git' | 'preview';

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

// WebSocket message types (Server → Client, text frames)
export type WsServerMessage =
  | WsSessionStatusMessage
  | WsFileChangedMessage
  | WsPortDetectedMessage
  | WsPortClosedMessage
  | WsNeedsInputMessage
  | WsArtifactMessage
  | WsErrorMessage;

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
