export type WsServerMessage =
  | { type: 'session_status'; sessionId: string; status: string; claudeSessionId: string | null; pid: number | null }
  | { type: 'file_changed'; paths: string[]; timestamp: string }
  | { type: 'port_detected'; port: number; localPort: number; protocol: string }
  | { type: 'port_closed'; port: number }
  | { type: 'needs_input'; sessionId: string; needsInput: boolean; detectedPattern: string; idleSeconds: number }
  | { type: 'artifact'; artifactId: string; artifactType: string; path: string; previewUrl: string }
  | { type: 'board_command'; sessionId: string; command: string; params: Record<string, string> }
  | { type: 'shell_status'; sessionId: string; status: 'running' | 'stopped' | 'killed'; pid?: number; exitCode?: number; shell?: string }
  | { type: 'error'; message: string; recoverable: boolean };

export interface WsClientOptions {
  sessionId: string;
  onBinaryData: (data: ArrayBuffer) => void;
  onMessage: (msg: WsServerMessage) => void;
  onClose: () => void;
  onOpen: () => void;
  onReconnect?: () => void;
}

export class SessionWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private closed = false;
  private hasConnected = false;

  constructor(private options: WsClientOptions) {}

  connect(): void {
    this.closed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sessions/${this.options.sessionId}`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      if (this.hasConnected) {
        this.options.onReconnect?.();
      }
      this.hasConnected = true;
      this.options.onOpen();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.options.onBinaryData(event.data);
      } else {
        try {
          const msg = JSON.parse(event.data as string) as WsServerMessage;
          this.options.onMessage(msg);
        } catch {
          // ignore malformed JSON
        }
      }
    };

    this.ws.onclose = () => {
      this.options.onClose();
      if (!this.closed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  sendInput(data: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  sendBinary(data: ArrayBuffer | Uint8Array): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  sendResize(cols: number, rows: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
      this.connect();
    }, this.reconnectDelay);
  }
}
