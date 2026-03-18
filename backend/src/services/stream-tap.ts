import WebSocket from 'ws';
import { logger } from './logger.js';

const DEFAULT_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229];
const SCREENCAST_CONFIG = { format: 'jpeg' as const, quality: 70, everyNthFrame: 2 };

export interface StreamTapCallbacks {
  onFrame: (data: Buffer) => void;
  onStatus: (status: 'connected' | 'unavailable', reason?: string) => void;
  onUrl: (url: string) => void;
}

export class StreamTap {
  private cdpWs: WebSocket | null = null;
  private callbacks: StreamTapCallbacks | null = null;
  private messageId = 1;
  private streaming = false;
  private pendingCallbacks = new Map<number, (result: any) => void>();

  async discoverChrome(): Promise<string | null> {
    const envPort = process.env.CHROME_DEBUG_PORT;
    if (envPort) {
      const url = await this.tryPort(Number(envPort));
      if (url) return url;
    }
    for (const port of DEFAULT_PORTS) {
      const url = await this.tryPort(port);
      if (url) return url;
    }
    return null;
  }

  private async tryPort(port: number): Promise<string | null> {
    try {
      const resp = await fetch(`http://localhost:${port}/json/version`);
      if (!resp.ok) return null;
      const data = await resp.json();
      return data.webSocketDebuggerUrl || null;
    } catch {
      return null;
    }
  }

  async connect(callbacks: StreamTapCallbacks): Promise<boolean> {
    this.callbacks = callbacks;
    const debugUrl = await this.discoverChrome();
    if (!debugUrl) {
      callbacks.onStatus('unavailable', 'Chrome not found on worker');
      return false;
    }

    return new Promise((resolve) => {
      this.cdpWs = new WebSocket(debugUrl);

      this.cdpWs.on('open', () => {
        logger.info('Stream Tap connected to Chrome');
        callbacks.onStatus('connected');
        this.subscribeToNavigation();
        resolve(true);
      });

      this.cdpWs.on('message', (data) => {
        this.handleCdpMessage(JSON.parse(data.toString()));
      });

      this.cdpWs.on('close', () => {
        logger.info('Stream Tap disconnected from Chrome');
        this.streaming = false;
        callbacks.onStatus('unavailable', 'Chrome disconnected');
      });

      this.cdpWs.on('error', () => {
        callbacks.onStatus('unavailable', 'Chrome connection error');
        resolve(false);
      });
    });
  }

  private sendCdp(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.cdpWs || this.cdpWs.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'));
        return;
      }
      const id = this.messageId++;
      this.pendingCallbacks.set(id, resolve);
      this.cdpWs.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pendingCallbacks.has(id)) {
          this.pendingCallbacks.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 10000);
    });
  }

  private fireCdp(method: string, params: Record<string, unknown> = {}): void {
    if (!this.cdpWs || this.cdpWs.readyState !== WebSocket.OPEN) return;
    const id = this.messageId++;
    this.cdpWs.send(JSON.stringify({ id, method, params }));
  }

  private handleCdpMessage(msg: any): void {
    if (msg.id && this.pendingCallbacks.has(msg.id)) {
      const cb = this.pendingCallbacks.get(msg.id)!;
      this.pendingCallbacks.delete(msg.id);
      cb(msg.result);
      return;
    }
    if (msg.method === 'Page.screencastFrame') {
      this.handleScreencastFrame(msg.params);
    } else if (msg.method === 'Page.frameNavigated') {
      const url = msg.params?.frame?.url;
      if (url && !msg.params?.frame?.parentId) {
        this.callbacks?.onUrl(url);
      }
    }
  }

  private handleScreencastFrame(params: any): void {
    this.sendCdp('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
    const jpegBytes = Buffer.from(params.data, 'base64');
    const width = params.metadata?.deviceWidth || 1280;
    const height = params.metadata?.deviceHeight || 720;
    const header = Buffer.alloc(8);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    const frame = Buffer.concat([header, jpegBytes]);
    this.callbacks?.onFrame(frame);
  }

  private async subscribeToNavigation(): Promise<void> {
    await this.sendCdp('Page.enable');
  }

  async startScreencast(): Promise<void> {
    if (this.streaming) return;
    this.streaming = true;
    await this.sendCdp('Page.startScreencast', SCREENCAST_CONFIG);
  }

  async stopScreencast(): Promise<void> {
    if (!this.streaming) return;
    this.streaming = false;
    await this.sendCdp('Page.stopScreencast').catch(() => {});
  }

  async navigate(url: string): Promise<void> {
    await this.sendCdp('Page.navigate', { url });
  }

  async dispatchMouseEvent(type: string, x: number, y: number, button?: string, clickCount?: number): Promise<void> {
    const cdpButton = button === 'right' ? 'right' : button === 'middle' ? 'middle' : 'left';
    this.fireCdp('Input.dispatchMouseEvent', {
      type, x, y,
      button: cdpButton,
      clickCount: clickCount || (type === 'mousePressed' ? 1 : 0),
    });
  }

  async dispatchKeyEvent(type: string, key: string, text: string, code: string, modifiers?: number): Promise<void> {
    this.fireCdp('Input.dispatchKeyEvent', {
      type: type === 'down' ? 'keyDown' : 'keyUp',
      key, text, code,
      modifiers: modifiers || 0,
    });
  }

  async dispatchScroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    this.fireCdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY });
  }

  async dispatchTouch(type: string, x: number, y: number): Promise<void> {
    const cdpType = type === 'start' || type === 'tap' ? 'touchStart' :
                    type === 'move' ? 'touchMove' : 'touchEnd';
    this.fireCdp('Input.dispatchTouchEvent', {
      type: cdpType,
      touchPoints: cdpType === 'touchEnd' ? [] : [{ x, y }],
    });
    if (type === 'tap') {
      this.fireCdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await this.dispatchMouseEvent('mousePressed', x, y, 'left', 1);
      await this.dispatchMouseEvent('mouseReleased', x, y, 'left', 1);
    }
  }

  async setViewport(width: number, height: number): Promise<void> {
    await this.sendCdp('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: width <= 768,
    });
  }

  async captureScreenshot(): Promise<Buffer> {
    const result = await this.sendCdp('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(result.data, 'base64');
  }

  disconnect(): void {
    this.streaming = false;
    this.pendingCallbacks.clear();
    if (this.cdpWs) {
      this.cdpWs.close();
      this.cdpWs = null;
    }
  }

  isConnected(): boolean {
    return this.cdpWs?.readyState === WebSocket.OPEN;
  }
}
