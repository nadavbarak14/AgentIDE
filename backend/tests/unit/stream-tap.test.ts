import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamTap } from '../../src/services/stream-tap.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('StreamTap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('discoverChrome', () => {
    it('discovers Chrome on default port 9222', async () => {
      // tryPort calls /json/version then /json/list
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc123' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ type: 'page', webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/page1' }]) });
      const tap = new StreamTap();
      const url = await tap.discoverChrome();
      expect(url).toBe('ws://localhost:9222/devtools/page/page1');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/version');
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9222/json/list');
    });

    it('scans ports 9222-9229 when default fails', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))  // 9222 version
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))  // 9223 version
        .mockResolvedValueOnce({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://localhost:9224/devtools/browser/def456' }) })  // 9224 version
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ type: 'page', webSocketDebuggerUrl: 'ws://localhost:9224/devtools/page/page2' }]) });  // 9224 list
      const tap = new StreamTap();
      const url = await tap.discoverChrome();
      expect(url).toBe('ws://localhost:9224/devtools/page/page2');
    });

    it('uses CHROME_DEBUG_PORT env var when set', async () => {
      vi.stubEnv('CHROME_DEBUG_PORT', '9333');
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ webSocketDebuggerUrl: 'ws://localhost:9333/devtools/browser/ghi789' }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ type: 'page', webSocketDebuggerUrl: 'ws://localhost:9333/devtools/page/page3' }]) });
      const tap = new StreamTap();
      const url = await tap.discoverChrome();
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:9333/json/version');
      vi.unstubAllEnvs();
    });

    it('returns null when no Chrome found', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
      const tap = new StreamTap();
      const url = await tap.discoverChrome();
      expect(url).toBeNull();
    });
  });

  describe('input forwarding', () => {
    it('dispatches mouse click as mousePressed', async () => {
      const tap = new StreamTap();
      const mockWsSend = vi.fn();
      (tap as any).cdpWs = { readyState: 1, send: mockWsSend };
      await tap.dispatchMouseEvent('mousePressed', 100, 200, 'left', 1);
      expect(mockWsSend).toHaveBeenCalled();
      const sent = JSON.parse(mockWsSend.mock.calls[0][0]);
      expect(sent.method).toBe('Input.dispatchMouseEvent');
      expect(sent.params.x).toBe(100);
      expect(sent.params.y).toBe(200);
    });

    it('dispatches keyboard event', async () => {
      const tap = new StreamTap();
      const mockWsSend = vi.fn();
      (tap as any).cdpWs = { readyState: 1, send: mockWsSend };
      await tap.dispatchKeyEvent('down', 'Enter', '\r', 'Enter');
      const sent = JSON.parse(mockWsSend.mock.calls[0][0]);
      expect(sent.method).toBe('Input.dispatchKeyEvent');
      expect(sent.params.type).toBe('keyDown');
    });

    it('dispatches scroll as mouseWheel', async () => {
      const tap = new StreamTap();
      const mockWsSend = vi.fn();
      (tap as any).cdpWs = { readyState: 1, send: mockWsSend };
      await tap.dispatchScroll(400, 300, 0, -120);
      const sent = JSON.parse(mockWsSend.mock.calls[0][0]);
      expect(sent.params.type).toBe('mouseWheel');
      expect(sent.params.deltaY).toBe(-120);
    });
  });

  describe('screencast frame encoding', () => {
    it('encodes frame as 8-byte header + JPEG bytes', () => {
      const tap = new StreamTap();
      let capturedFrame: Buffer | null = null;
      (tap as any).callbacks = {
        onFrame: (data: Buffer) => { capturedFrame = data; },
        onStatus: () => {},
        onUrl: () => {},
      };
      (tap as any).cdpWs = { readyState: 1, send: vi.fn() };

      const fakeJpeg = Buffer.from('fake-jpeg-data');
      const fakeBase64 = fakeJpeg.toString('base64');
      (tap as any).handleScreencastFrame({
        data: fakeBase64,
        sessionId: 1,
        metadata: { deviceWidth: 1280, deviceHeight: 720 },
      });

      expect(capturedFrame).not.toBeNull();
      const width = capturedFrame!.readUInt32BE(0);
      const height = capturedFrame!.readUInt32BE(4);
      expect(width).toBe(1280);
      expect(height).toBe(720);
      const jpeg = capturedFrame!.subarray(8);
      expect(jpeg.toString()).toBe('fake-jpeg-data');
    });
  });
});
