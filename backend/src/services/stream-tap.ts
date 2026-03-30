import { execFile, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import { logger } from './logger.js';

const DEFAULT_PORTS = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229];
const DEFAULT_DEBUG_PORT = 9222;
const SCREENCAST_CONFIG = { format: 'jpeg' as const, quality: 50, everyNthFrame: 2, maxWidth: 1280, maxHeight: 960 };

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
  private recordingFrames: Buffer[] | null = null;
  private recordingStartTime = 0;
  private currentMobile = false;
  private chromeTabId: string | null = null;
  private chromeDebugPort: number | null = null;

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
    if (await this.isPortListening(port)) {
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
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-popup-blocking',
      '--disable-hang-monitor',
      '--disable-prompt-on-repost',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-domain-reliability',
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
      if (await this.isPortListening(port)) {
        logger.info({ port }, 'Chrome is ready');
        return port;
      }
    }

    logger.warn('Chrome launched but debug port not ready after 6s');
    return null;
  }

  /**
   * Discover Chrome and return a PAGE-level debugger WebSocket URL.
   * Each StreamTap creates its own tab so sessions don't share a page.
   */
  async discoverChrome(): Promise<string | null> {
    const port = await this.findChromePort();
    if (port == null) return null;

    try {
      // Create a new tab for this session — each session gets isolated page state
      const newTabResp = await fetch(`http://localhost:${port}/json/new?about:blank`, { method: 'PUT' });
      if (newTabResp.ok) {
        const tab = await newTabResp.json() as { id: string; webSocketDebuggerUrl: string };
        if (tab.webSocketDebuggerUrl) {
          this.chromeTabId = tab.id;
          this.chromeDebugPort = port;
          return tab.webSocketDebuggerUrl;
        }
      }

      // Fallback: reuse existing page (single-session mode)
      const listResp = await fetch(`http://localhost:${port}/json/list`);
      if (!listResp.ok) return null;
      const targets = await listResp.json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
      const page = targets.find(t => t.type === 'page');
      return page?.webSocketDebuggerUrl ?? null;
    } catch {
      return null;
    }
  }

  /** Find a Chrome debug port that's listening. */
  private async findChromePort(): Promise<number | null> {
    const envPort = process.env.CHROME_DEBUG_PORT;
    if (envPort) {
      const ok = await this.isPortListening(Number(envPort));
      if (ok) return Number(envPort);
    }
    for (const port of DEFAULT_PORTS) {
      const ok = await this.isPortListening(port);
      if (ok) return port;
    }
    return null;
  }

  private async isPortListening(port: number): Promise<boolean> {
    try {
      const resp = await fetch(`http://localhost:${port}/json/version`);
      return resp.ok;
    } catch {
      return false;
    }
  }

  /** Close the dedicated tab when this StreamTap disconnects. */
  private async closeTab(): Promise<void> {
    if (this.chromeTabId && this.chromeDebugPort) {
      try {
        await fetch(`http://localhost:${this.chromeDebugPort}/json/close/${this.chromeTabId}`, { method: 'PUT' });
      } catch { /* best effort */ }
      this.chromeTabId = null;
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
        debugUrl = await this.discoverChrome();
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
    // Fire-and-forget ack — don't wait for response to unblock next frame
    this.fireCdp('Page.screencastFrameAck', { sessionId: params.sessionId });
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

  async goBack(): Promise<void> {
    const { currentIndex, entries } = await this.sendCdp('Page.getNavigationHistory');
    if (currentIndex > 0) {
      await this.sendCdp('Page.navigateToHistoryEntry', { entryId: entries[currentIndex - 1].id });
    }
  }

  async goForward(): Promise<void> {
    const { currentIndex, entries } = await this.sendCdp('Page.getNavigationHistory');
    if (currentIndex < entries.length - 1) {
      await this.sendCdp('Page.navigateToHistoryEntry', { entryId: entries[currentIndex + 1].id });
    }
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

  async setViewport(width: number, height: number, mobile?: boolean): Promise<void> {
    const isMobile = mobile ?? width <= 768;
    const wasMobile = this.currentMobile;
    this.currentMobile = isMobile;
    await this.sendCdp('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: isMobile ? 3 : 1, mobile: isMobile,
    });
    // Set mobile user-agent so sites serve mobile versions
    if (isMobile) {
      await this.sendCdp('Emulation.setUserAgentOverride', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Mobile/15E148 Safari/604.1',
        platform: 'iPhone',
      });
    } else {
      // Desktop device selected — clear any mobile UA override
      await this.sendCdp('Emulation.setUserAgentOverride', { userAgent: '' });
    }
    // Reload page when switching between mobile/desktop so the new user-agent takes effect
    if (isMobile !== wasMobile) {
      await this.sendCdp('Page.reload', {}).catch(() => {});
    }
    // Restart screencast to pick up new viewport dimensions
    if (this.streaming) {
      await this.sendCdp('Page.stopScreencast').catch(() => {});
      await this.sendCdp('Page.startScreencast', SCREENCAST_CONFIG);
    }
  }

  async clearViewport(): Promise<void> {
    const wasMobile = this.currentMobile;
    this.currentMobile = false;
    await this.sendCdp('Emulation.clearDeviceMetricsOverride');
    // Clear any mobile user-agent override
    await this.sendCdp('Emulation.setUserAgentOverride', { userAgent: '' });
    // Reload if we were in mobile mode so page gets desktop UA
    if (wasMobile) {
      await this.sendCdp('Page.reload', {}).catch(() => {});
    }
    // Restart screencast to pick up new viewport dimensions
    if (this.streaming) {
      await this.sendCdp('Page.stopScreencast').catch(() => {});
      await this.sendCdp('Page.startScreencast', SCREENCAST_CONFIG);
    }
  }

  async captureScreenshot(): Promise<Buffer> {
    const result = await this.sendCdp('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(result.data, 'base64');
  }

  private recordingInterval: ReturnType<typeof setInterval> | null = null;

  /** Start collecting screenshots periodically for server-side recording */
  async startRecording(): Promise<void> {
    this.recordingFrames = [];
    this.recordingStartTime = Date.now();
    // Capture a screenshot every 500ms using Page.captureScreenshot
    // This works on static pages unlike screencast which only sends on render
    const capture = async () => {
      if (!this.recordingFrames) return;
      try {
        const result = await this.sendCdp('Page.captureScreenshot', { format: 'jpeg', quality: 50 });
        if (this.recordingFrames) {
          this.recordingFrames.push(Buffer.from(result.data, 'base64'));
        }
      } catch { /* ignore capture errors */ }
    };
    await capture(); // Capture first frame immediately
    this.recordingInterval = setInterval(capture, 500);
    logger.info('startRecording: capturing screenshots every 500ms');
  }

  /** Stop recording and return collected frames + duration */
  stopRecording(): { frames: Buffer[]; durationMs: number } | null {
    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
      this.recordingInterval = null;
    }
    const frameCount = this.recordingFrames?.length ?? -1;
    logger.info({ frameCount, durationMs: Date.now() - this.recordingStartTime }, 'stopRecording called');
    if (!this.recordingFrames || this.recordingFrames.length === 0) return null;
    const result = {
      frames: this.recordingFrames,
      durationMs: Date.now() - this.recordingStartTime,
    };
    this.recordingFrames = null;
    this.recordingStartTime = 0;
    return result;
  }

  isRecording(): boolean {
    return this.recordingFrames !== null;
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
    // Close this session's dedicated tab (Chrome process stays for other sessions)
    this.closeTab();
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
