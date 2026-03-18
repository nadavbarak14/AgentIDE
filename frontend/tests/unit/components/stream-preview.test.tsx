import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StreamPreview } from '../../../src/components/StreamPreview';

describe('StreamPreview', () => {
  it('shows unavailable message when no Chrome', () => {
    render(
      <StreamPreview
        sessionId="test-123"
        status="unavailable"
        frame={null}
        currentUrl=""
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/no browser active/i)).toBeTruthy();
  });

  it('renders frame image when streaming', () => {
    render(
      <StreamPreview
        sessionId="test-123"
        status="connected"
        frame={{ objectUrl: 'blob:http://localhost/abc', width: 1280, height: 720 }}
        currentUrl="http://localhost:3000"
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const img = document.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.src).toContain('blob:');
  });

  it('shows connecting message when disconnected', () => {
    render(
      <StreamPreview
        sessionId="test-123"
        status="disconnected"
        frame={null}
        currentUrl=""
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/connecting/i)).toBeTruthy();
  });
});
