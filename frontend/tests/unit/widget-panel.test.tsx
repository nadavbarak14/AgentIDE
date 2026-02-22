import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WidgetPanel } from '../../src/components/WidgetPanel';
import type { WidgetData } from '../../src/hooks/useWidgets';

// Helper to create a WidgetData object
function createWidget(overrides: Partial<WidgetData> = {}): WidgetData {
  return {
    name: 'test-widget',
    html: '<html><body><h1>Hello Widget</h1></body></html>',
    createdAt: Date.now(),
    ...overrides,
  };
}

// Default props helper
function defaultProps(overrides: Partial<Parameters<typeof WidgetPanel>[0]> = {}) {
  return {
    widgets: [] as WidgetData[],
    activeWidget: null as WidgetData | null,
    sessionId: 'session-1',
    onClose: vi.fn(),
    onSetActiveWidget: vi.fn(),
    ...overrides,
  };
}

describe('WidgetPanel', () => {
  // ---------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------
  describe('empty state', () => {
    it('shows empty state when no widgets are provided', () => {
      render(<WidgetPanel {...defaultProps()} />);

      expect(screen.getByText('Widgets')).toBeInTheDocument();
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('shows empty state message text', () => {
      render(<WidgetPanel {...defaultProps()} />);

      expect(
        screen.getByText(/No widgets — the agent can create interactive widgets here/),
      ).toBeInTheDocument();
    });

    it('shows empty state when activeWidget is null even with widgets in the list', () => {
      const widget = createWidget();
      render(
        <WidgetPanel {...defaultProps({ widgets: [widget], activeWidget: null })} />,
      );

      expect(
        screen.getByText(/No widgets — the agent can create interactive widgets here/),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------
  // Iframe rendering
  // ---------------------------------------------------------------
  describe('iframe rendering', () => {
    it('renders iframe with srcDoc when a widget is provided', () => {
      const widget = createWidget({ html: '<p>Widget Content</p>' });
      render(
        <WidgetPanel
          {...defaultProps({ widgets: [widget], activeWidget: widget })}
        />,
      );

      const iframe = screen.getByTitle('Widget: test-widget') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.tagName).toBe('IFRAME');
      expect(iframe.getAttribute('srcdoc')).toBe('<p>Widget Content</p>');
    });

    it('iframe has sandbox="allow-scripts" attribute', () => {
      const widget = createWidget();
      render(
        <WidgetPanel
          {...defaultProps({ widgets: [widget], activeWidget: widget })}
        />,
      );

      const iframe = screen.getByTitle('Widget: test-widget') as HTMLIFrameElement;
      expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    });
  });

  // ---------------------------------------------------------------
  // Header: single widget vs. multiple widgets
  // ---------------------------------------------------------------
  describe('header display', () => {
    it('shows widget name in header when single widget', () => {
      const widget = createWidget({ name: 'My Chart' });
      render(
        <WidgetPanel
          {...defaultProps({ widgets: [widget], activeWidget: widget })}
        />,
      );

      expect(screen.getByText('My Chart')).toBeInTheDocument();
      // Should not show a dropdown for a single widget
      expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('shows select dropdown when multiple widgets', () => {
      const widget1 = createWidget({ name: 'Chart' });
      const widget2 = createWidget({ name: 'Table' });
      render(
        <WidgetPanel
          {...defaultProps({
            widgets: [widget1, widget2],
            activeWidget: widget1,
          })}
        />,
      );

      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.value).toBe('Chart');

      // Both options should be present
      const options = select.querySelectorAll('option');
      expect(options).toHaveLength(2);
      expect(options[0].textContent).toBe('Chart');
      expect(options[1].textContent).toBe('Table');
    });
  });

  // ---------------------------------------------------------------
  // Interactions
  // ---------------------------------------------------------------
  describe('interactions', () => {
    it('calls onSetActiveWidget when dropdown changes', () => {
      const onSetActiveWidget = vi.fn();
      const widget1 = createWidget({ name: 'Chart' });
      const widget2 = createWidget({ name: 'Table' });
      render(
        <WidgetPanel
          {...defaultProps({
            widgets: [widget1, widget2],
            activeWidget: widget1,
            onSetActiveWidget,
          })}
        />,
      );

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: 'Table' } });

      expect(onSetActiveWidget).toHaveBeenCalledTimes(1);
      expect(onSetActiveWidget).toHaveBeenCalledWith('Table');
    });

    it('calls onClose when close button clicked in empty state', () => {
      const onClose = vi.fn();
      render(<WidgetPanel {...defaultProps({ onClose })} />);

      const closeButton = screen.getByTitle('Close panel');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when close button clicked with active widget', () => {
      const onClose = vi.fn();
      const widget = createWidget();
      render(
        <WidgetPanel
          {...defaultProps({ widgets: [widget], activeWidget: widget, onClose })}
        />,
      );

      const closeButton = screen.getByTitle('Close panel');
      fireEvent.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------
  describe('edge cases', () => {
    it('handles widget with empty HTML gracefully', () => {
      const widget = createWidget({ name: 'Empty Widget', html: '' });
      render(
        <WidgetPanel
          {...defaultProps({ widgets: [widget], activeWidget: widget })}
        />,
      );

      const iframe = screen.getByTitle('Widget: Empty Widget') as HTMLIFrameElement;
      expect(iframe).toBeInTheDocument();
      expect(iframe.getAttribute('srcdoc')).toBe('');
    });
  });
});
