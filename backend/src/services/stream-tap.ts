import { execFile, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import { logger } from './logger.js';

const DEFAULT_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229];
const DEFAULT_DEBUG_PORT = 9222;
const SCREENCAST_CONFIG = { format: 'jpeg' as const, quality: 70, everyNthFrame: 2 };

/** Chrome binary names to try, in order */
const CHROME_BINARIES = [
  'google-chrome',
  'google-chrome-stable',
  'chromium-browser',
  'chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
];

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
  private chromeProcess: ChildProcess | null = null;

  /**
   * Find a Chrome/Chromium binary on the system.
   */
  private async findChromeBinary(): Promise<string | null> {
    for (const bin of CHROME_BINARIES) {
      try {
        await new Promise<void>((resolve, reject) => {
          execFile('which', [bin], (err) => err ? reject(err) : resolve());
        });
        return bin;
      } catch {
        // not found, try next
      }
    }
    return null;
  }

  /**
   * Launch headless Chrome with remote debugging enabled.
   * Returns the debug port, or null if Chrome couldn't be launched.
   */
  async launchChrome(): Promise<number | null> {
    const port = Number(process.env.CHROME_DEBUG_PORT) || DEFAULT_DEBUG_PORT;

    // Already running?
    const existing = await this.tryPort(port);
    if (existing) {
      logger.info({ port }, 'Chrome already running on debug port');
      return port;
    }

    const binary = await this.findChromeBinary();
    if (!binary) {
      logger.warn('No Chrome/Chromium binary found on this machine');
      return null;
    }

    const args = [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-dev-shm-usage',
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--metrics-recording-only',
      '--mute-audio',
      '--window-size=1280,720',
      'about:blank',
    ];

    logger.info({ binary, port }, 'Launching headless Chrome');

    this.chromeProcess = execFile(binary, args, { stdio: 'ignore' } as any);

    // Detach so Chrome doesn't die when the agent stops
    this.chromeProcess.unref();

    this.chromeProcess.on('error', (err) => {
      logger.warn({ err, binary }, 'Failed to launch Chrome');
      this.chromeProcess = null;
    });

    this.chromeProcess.on('exit', (code) => {
      logger.info({ code }, 'Chrome process exited');
      this.chromeProcess = null;
    });

    // Wait for Chrome to start listening
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      const url = await this.tryPort(port);
      if (url) {
        logger.info({ port }, 'Chrome is ready');
        return port;
      }
    }

    logger.warn('Chrome launched but debug port not ready after 6s');
    return null;
  }

  /**
   * Discover Chrome and return a PAGE-level debugger WebSocket URL.
   * Page.startScreencast requires a page target, not the browser target.
   */
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
      // First check if Chrome is listening at all
      const versionResp = await fetch(`http://localhost:${port}/json/version`);
      if (!versionResp.ok) return null;

      // Get the first page target — Page.startScreencast needs a page, not the browser
      const listResp = await fetch(`http://localhost:${port}/json/list`);
      if (!listResp.ok) return null;
      const targets = await listResp.json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = targets.find(t => t.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        return page.webSocketDebuggerUrl;
      }

      // No page target — fall back to browser-level (won't support screencast but will connect)
      const data = await versionResp.json();
      return data.webSocketDebuggerUrl || null;
    } catch {
      return null;
    }
  }

  async connect(callbacks: StreamTapCallbacks): Promise<boolean> {
    this.callbacks = callbacks;
    let debugUrl = await this.discoverChrome();

    // If Chrome isn't running, try to launch it
    if (!debugUrl) {
      logger.info('Chrome not found, attempting to launch...');
      const port = await this.launchChrome();
      if (port) {
        debugUrl = await this.tryPort(port);
      }
    }

    if (!debugUrl) {
      callbacks.onStatus('unavailable', 'Chrome not available — install google-chrome or chromium-browser');
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
    const cdpButton = button === 'right' ? 'right' : button === 'middle' ? 'middle' : button === 'none' ? 'none' : 'left';
    this.fireCdp('Input.dispatchMouseEvent', {
      type, x, y,
      button: cdpButton,
      clickCount: clickCount ?? (type === 'mousePressed' ? 1 : 0),
    });
  }

  async dispatchKeyEvent(type: string, key: string, text: string, code: string, modifiers?: number): Promise<void> {
    const mods = modifiers || 0;
    // Map special keys to their Windows virtual key codes
    const vkeyMap: Record<string, number> = {
      Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18,
      Escape: 27, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
      ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
      Insert: 45, Delete: 46,
      F1: 112, F2: 113, F3: 114, F4: 115, F5: 116, F6: 117,
      F7: 118, F8: 119, F9: 120, F10: 121, F11: 122, F12: 123,
    };
    const vkCode = text ? text.charCodeAt(0) : (vkeyMap[key] || 0);

    if (type === 'down') {
      this.fireCdp('Input.dispatchKeyEvent', {
        type: 'keyDown', key, code, modifiers: mods,
        windowsVirtualKeyCode: vkCode,
      });
      // Send char event for printable text so input fields receive characters
      if (text) {
        this.fireCdp('Input.dispatchKeyEvent', {
          type: 'char', text, key, code, modifiers: mods,
        });
      }
    } else {
      this.fireCdp('Input.dispatchKeyEvent', {
        type: 'keyUp', key, code, modifiers: mods,
        windowsVirtualKeyCode: vkCode,
      });
    }
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

  /** Get the accessibility tree as a text snapshot for the agent */
  async getAccessibilityTree(): Promise<string> {
    await this.sendCdp('Accessibility.enable');
    const { nodes } = await this.sendCdp('Accessibility.getFullAXTree');
    const lines: string[] = [];
    for (const node of nodes || []) {
      const role = node.role?.value || '';
      const name = node.name?.value || '';
      if (!role || role === 'none' || role === 'generic' || role === 'InlineTextBox') continue;
      const props: string[] = [];
      if (node.properties) {
        for (const p of node.properties) {
          if (p.name === 'focused' && p.value?.value) props.push('focused');
          if (p.name === 'disabled' && p.value?.value) props.push('disabled');
          if (p.name === 'checked' && p.value?.value) props.push('checked');
          if (p.name === 'selected' && p.value?.value) props.push('selected');
        }
      }
      const value = node.value?.value ? ` value="${node.value.value}"` : '';
      const propsStr = props.length ? ` [${props.join(', ')}]` : '';
      lines.push(`${role}: ${name}${value}${propsStr}`);
    }
    return lines.join('\n') || 'Empty page';
  }

  /** Find an element by role and name, return its center coordinates */
  async findElementByRoleName(role: string, name: string): Promise<{ x: number; y: number } | null> {
    // Use DOM + JS to find element by accessibility role/name
    const result = await this.sendCdp('Runtime.evaluate', {
      expression: `(() => {
        const roles = {'button':'button','link':'a','textbox':'input,textarea','checkbox':'input[type=checkbox]','heading':'h1,h2,h3,h4,h5,h6','img':'img','combobox':'select'};
        const selectors = roles['${role}'] || '${role}';
        const els = document.querySelectorAll(selectors);
        for (const el of els) {
          const text = el.textContent?.trim() || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('alt') || el.getAttribute('title') || el.getAttribute('name') || '';
          if (text.toLowerCase().includes('${name.toLowerCase().replace(/'/g, "\\'")}')) {
            const r = el.getBoundingClientRect();
            return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), found: true });
          }
        }
        return JSON.stringify({ found: false });
      })()`,
      returnByValue: true,
    });
    try {
      const parsed = JSON.parse(result.result.value);
      return parsed.found ? { x: parsed.x, y: parsed.y } : null;
    } catch { return null; }
  }

  /** Click an element by role and name */
  async clickByRoleName(role: string, name: string): Promise<boolean> {
    const pos = await this.findElementByRoleName(role, name);
    if (!pos) return false;
    await this.dispatchMouseEvent('mousePressed', pos.x, pos.y, 'left', 1);
    await this.dispatchMouseEvent('mouseReleased', pos.x, pos.y, 'left', 1);
    return true;
  }

  /** Type text into an element by role and name */
  async typeByRoleName(role: string, name: string, text: string): Promise<boolean> {
    const clicked = await this.clickByRoleName(role, name);
    if (!clicked) return false;
    // Small delay for focus
    await new Promise(r => setTimeout(r, 100));
    for (const char of text) {
      await this.dispatchKeyEvent('down', char, char, `Key${char.toUpperCase()}`);
    }
    return true;
  }

  disconnect(): void {
    this.streaming = false;
    this.pendingCallbacks.clear();
    if (this.cdpWs) {
      this.cdpWs.close();
      this.cdpWs = null;
    }
    // Don't kill Chrome — it's reused across preview reconnections.
    // Call destroy() to fully tear down including the Chrome process.
  }

  /** Fully tear down including killing the Chrome process. */
  destroy(): void {
    this.disconnect();
    if (this.chromeProcess) {
      this.chromeProcess.kill();
      this.chromeProcess = null;
    }
  }

  isConnected(): boolean {
    return this.cdpWs?.readyState === WebSocket.OPEN;
  }
}
