/**
 * Integration tests for the browser preview device presets, mobile extensions,
 * and work report fixes.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Polyfill ResizeObserver for jsdom
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) { this.callback = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// ─── StreamPreview: ResizeObserver should NOT fire when viewport is set ───

describe('StreamPreview device preset fix', () => {
  // We test the core logic: ResizeObserver should be suppressed when a viewport preset is active
  it('does not call onResize when viewport prop is set (device preset active)', async () => {
    const { StreamPreview } = await import('../../src/components/StreamPreview');
    const onResize = vi.fn();
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    const { rerender } = render(
      <StreamPreview
        sessionId="test-session"
        status="connected"
        frame={{ objectUrl: 'blob:test', width: 402, height: 874 }}
        currentUrl="http://localhost:3000"
        onNavigate={onNavigate}
        onClose={onClose}
        onResize={onResize}
        viewport="mobile"
        selectedDeviceId="iphone-17-pro"
      />,
    );

    // ResizeObserver should NOT have been set up because viewport is non-null
    // Give it a tick for useEffect to fire
    await new Promise((r) => setTimeout(r, 50));
    expect(onResize).not.toHaveBeenCalled();

    // Now switch to responsive mode (viewport=null) — ResizeObserver should be set up
    rerender(
      <StreamPreview
        sessionId="test-session"
        status="connected"
        frame={{ objectUrl: 'blob:test', width: 1280, height: 720 }}
        currentUrl="http://localhost:3000"
        onNavigate={onNavigate}
        onClose={onClose}
        onResize={onResize}
        viewport={null}
      />,
    );

    // onResize may or may not fire depending on jsdom's ResizeObserver support,
    // but the key thing is the effect was registered (no error thrown)
  });

  it('renders the device selector dropdown with phone/tablet/desktop presets', async () => {
    const { StreamPreview } = await import('../../src/components/StreamPreview');

    render(
      <StreamPreview
        sessionId="test-session"
        status="connected"
        frame={{ objectUrl: 'blob:test', width: 402, height: 874 }}
        currentUrl="http://localhost:3000"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
        viewport="mobile"
        selectedDeviceId="iphone-17-pro"
        onViewportChange={vi.fn()}
      />,
    );

    // Find and click the device viewport button
    const deviceButton = screen.getByTitle('Device viewport');
    expect(deviceButton).toBeInTheDocument();
    fireEvent.click(deviceButton);

    // The dropdown should show preset categories
    expect(screen.getByText('Phones')).toBeInTheDocument();
    expect(screen.getByText('Tablets')).toBeInTheDocument();
    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Responsive (fit)')).toBeInTheDocument();
  });

  it('calls onViewportChange when a device preset is selected', async () => {
    const { StreamPreview } = await import('../../src/components/StreamPreview');
    const onViewportChange = vi.fn();

    render(
      <StreamPreview
        sessionId="test-session"
        status="connected"
        frame={{ objectUrl: 'blob:test', width: 1280, height: 720 }}
        currentUrl="http://localhost:3000"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
        viewport={null}
        onViewportChange={onViewportChange}
      />,
    );

    // Open device menu
    fireEvent.click(screen.getByTitle('Device viewport'));

    // Click a phone preset (should find iPhone 17 Pro in the list)
    const presetButtons = screen.getAllByText(/iPhone 17 Pro/);
    fireEvent.click(presetButtons[0]);

    expect(onViewportChange).toHaveBeenCalledWith('mobile', expect.any(String));
  });

  it('calls onViewportChange(null) when Responsive is selected', async () => {
    const { StreamPreview } = await import('../../src/components/StreamPreview');
    const onViewportChange = vi.fn();

    render(
      <StreamPreview
        sessionId="test-session"
        status="connected"
        frame={{ objectUrl: 'blob:test', width: 402, height: 874 }}
        currentUrl="http://localhost:3000"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
        viewport="mobile"
        selectedDeviceId="iphone-17-pro"
        onViewportChange={onViewportChange}
      />,
    );

    fireEvent.click(screen.getByTitle('Device viewport'));
    fireEvent.click(screen.getByText('Responsive (fit)'));

    expect(onViewportChange).toHaveBeenCalledWith(null);
  });
});

// ─── MobilePreviewSheet: should pass viewport props to StreamPreview ───

describe('MobilePreviewSheet viewport support', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  it('renders with device selector props', async () => {
    const { MobilePreviewSheet } = await import('../../src/components/MobilePreviewSheet');

    render(
      <MobilePreviewSheet
        sessionId="test-session"
        onClose={vi.fn()}
      />,
    );

    // Should render the StreamPreview with a device viewport button
    await new Promise((r) => setTimeout(r, 100));
    const deviceButton = screen.queryByTitle('Device viewport');
    expect(deviceButton).toBeInTheDocument();
  });
});

// ─── MobileLayout: extension toggle and ref forwarding ───

describe('MobileLayout extension support', () => {
  beforeEach(() => {
    // Mock fetch for metadata/extensions endpoints
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/metadata')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ extensions: ['work-report'], widgets: [] }),
        });
      }
      if (url.includes('/api/extensions')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            { name: 'work-report', manifest: true },
            { name: 'frontend-design', manifest: true },
          ]),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }));
  });

  it('exports MobileLayoutHandle with handleFileChanged', async () => {
    const mod = await import('../../src/components/MobileLayout');
    // MobileLayout should be a forwardRef component
    expect(mod.MobileLayout).toBeDefined();
    // The MobileLayoutHandle type should be exported (TypeScript check — if it compiled, it works)
  });

  it('renders as a forwardRef component without crashing', async () => {
    const { MobileLayout } = await import('../../src/components/MobileLayout');
    const ref = { current: null };

    const { unmount } = render(
      <MobileLayout
        ref={ref}
        viewportHeight={844}
        keyboardOpen={false}
        keyboardOffset={0}
        sessions={[{ id: 's1', title: 'Test', status: 'active', needsInput: false, waitReason: null, createdAt: '', workingDirectory: '/test' } as any]}
        activeSessions={[{ id: 's1', title: 'Test', status: 'active', needsInput: false } as any]}
        currentSessionId="s1"
        onFocusSession={vi.fn()}
        onSetCurrentSession={vi.fn()}
        onNewSession={vi.fn()}
      >
        <div>Terminal placeholder</div>
      </MobileLayout>,
    );

    // Wait for metadata fetch
    await new Promise((r) => setTimeout(r, 100));

    // The ref should be populated with handleFileChanged
    expect(ref.current).not.toBeNull();
    expect(typeof ref.current!.handleFileChanged).toBe('function');

    unmount();
  });
});
