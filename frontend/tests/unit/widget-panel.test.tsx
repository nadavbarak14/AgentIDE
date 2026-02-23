import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetPanel } from '../../src/components/WidgetPanel';
import type { WidgetData } from '../../src/hooks/useWidgets';

function createWidget(overrides: Partial<WidgetData> = {}): WidgetData {
  return {
    name: '_canvas',
    html: '<html><body><h1>Hello</h1></body></html>',
    createdAt: Date.now(),
    ...overrides,
  };
}

function defaultProps(overrides: Partial<Parameters<typeof WidgetPanel>[0]> = {}) {
  return {
    widgets: [] as WidgetData[],
    activeWidget: null as WidgetData | null,
    sessionId: 'session-1',
    onClose: vi.fn(),
    onSetActiveWidget: vi.fn(),
    onDismissWidget: vi.fn(),
    ...overrides,
  };
}

describe('WidgetPanel (Canvas)', () => {
  describe('empty state', () => {
    it('shows empty state when no canvas content', () => {
      render(<WidgetPanel {...defaultProps()} />);
      expect(screen.getByText('Canvas')).toBeInTheDocument();
      expect(screen.getByText(/Claude's UI canvas/)).toBeInTheDocument();
    });

    it('calls onClose when close button clicked in empty state', () => {
      const onClose = vi.fn();
      render(<WidgetPanel {...defaultProps({ onClose })} />);
      fireEvent.click(screen.getByTitle('Close panel'));
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  describe('canvas rendering', () => {
    it('renders iframe with canvas content', () => {
      const widget = createWidget({ html: '<p>Pick a color</p>' });
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget })} />,
      );
      const iframe = screen.getByTitle('Canvas') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.tagName).toBe('IFRAME');
      const srcDoc = iframe.getAttribute('srcdoc') ?? '';
      expect(srcDoc).toContain('<p>Pick a color</p>');
      expect(srcDoc).toContain('C3.ready');
    });

    it('has no sandbox attribute', () => {
      const widget = createWidget();
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget })} />,
      );
      const iframe = screen.getByTitle('Canvas') as HTMLIFrameElement;
      expect(iframe.getAttribute('sandbox')).toBeNull();
    });

    it('shows "Canvas" header label', () => {
      const widget = createWidget();
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget })} />,
      );
      expect(screen.getByText('Canvas')).toBeInTheDocument();
    });

    it('has no widget selector dropdown', () => {
      const widget = createWidget();
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget })} />,
      );
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClose when close button clicked', () => {
      const onClose = vi.fn();
      const widget = createWidget();
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget, onClose })} />,
      );
      fireEvent.click(screen.getByTitle('Close panel'));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it('calls onDismissWidget when dismiss button clicked', () => {
      const onDismissWidget = vi.fn();
      const widget = createWidget();
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget, onDismissWidget })} />,
      );
      fireEvent.click(screen.getByTitle('Dismiss canvas'));
      expect(onDismissWidget).toHaveBeenCalledWith('_canvas');
    });
  });

  describe('edge cases', () => {
    it('handles empty HTML — still injects bridge SDK', () => {
      const widget = createWidget({ html: '' });
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: widget })} />,
      );
      const iframe = screen.getByTitle('Canvas') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      const srcDoc = iframe.getAttribute('srcdoc') ?? '';
      expect(srcDoc).toContain('C3.ready');
    });
  });
});
