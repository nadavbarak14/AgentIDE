export type PreviewServerMessage =
  | { type: 'preview:status'; status: 'connected' | 'unavailable'; reason?: string }
  | { type: 'preview:url'; url: string };

export class PreviewWebSocket {
  private ws: WebSocket | null = null;
  private closed = false;

  constructor(
    private sessionId: string,
    private callbacks: {
      onFrame: (data: ArrayBuffer) => void;
      onMessage: (msg: PreviewServerMessage) => void;
      onOpen: () => void;
      onClose: () => void;
    },
  ) {}

  connect(): void {
    this.closed = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/sessions/${this.sessionId}/preview`;
    this.ws = new WebSocket(url);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => this.callbacks.onOpen();
    this.ws.onclose = () => { this.callbacks.onClose(); if (!this.closed) this.reconnect(); };
    this.ws.onerror = () => {};

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        this.callbacks.onFrame(event.data);
      } else {
        try {
          this.callbacks.onMessage(JSON.parse(event.data));
        } catch { /* ignore malformed JSON */ }
      }
    };
  }

  sendJson(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  private reconnect(): void {
    setTimeout(() => { if (!this.closed) this.connect(); }, 2000);
  }
}
