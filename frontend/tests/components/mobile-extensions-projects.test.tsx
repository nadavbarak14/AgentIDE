/**
 * Tests for mobile extensions & projects relocation feature (044).
 * - Projects icon in MobileTopBar
 * - Projects removed from MobileHamburgerMenu
 * - Extension tab switching via MobileExtensionTabs
 * - Preview persistence (always-mounted)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
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

// ─── MobileTopBar: Projects icon ───

describe('MobileTopBar projects icon', () => {
  it('renders projects icon button when hasProjects is true', async () => {
    const { MobileTopBar } = await import('../../src/components/MobileTopBar');
    const onProjectsTap = vi.fn();

    render(
      <MobileTopBar
        sessionName="Test Session"
        projectPath="/home/user/project"
        isWaiting={false}
        waitingCount={0}
        sessionCount={1}
        onHamburgerTap={vi.fn()}
        onSessionTap={vi.fn()}
        onNewSession={vi.fn()}
        onProjectsTap={onProjectsTap}
        hasProjects={true}
      />,
    );

    const btn = screen.getByLabelText('Projects');
    expect(btn).toBeInTheDocument();

    fireEvent.click(btn);
    expect(onProjectsTap).toHaveBeenCalledOnce();
  });

  it('does not render projects icon when hasProjects is false', async () => {
    const { MobileTopBar } = await import('../../src/components/MobileTopBar');

    render(
      <MobileTopBar
        sessionName="Test Session"
        projectPath="/home/user/project"
        isWaiting={false}
        waitingCount={0}
        sessionCount={1}
        onHamburgerTap={vi.fn()}
        onSessionTap={vi.fn()}
        onNewSession={vi.fn()}
        hasProjects={false}
      />,
    );

    expect(screen.queryByLabelText('Projects')).not.toBeInTheDocument();
  });

  it('does not render projects icon when props are omitted', async () => {
    const { MobileTopBar } = await import('../../src/components/MobileTopBar');

    render(
      <MobileTopBar
        sessionName="Test Session"
        projectPath=""
        isWaiting={false}
        waitingCount={0}
        sessionCount={1}
        onHamburgerTap={vi.fn()}
        onSessionTap={vi.fn()}
        onNewSession={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Projects')).not.toBeInTheDocument();
  });
});

// ─── MobileHamburgerMenu: Projects removed ───

describe('MobileHamburgerMenu without Projects', () => {
  it('does not render a Projects menu item', async () => {
    const { MobileHamburgerMenu } = await import('../../src/components/MobileHamburgerMenu');

    render(
      <MobileHamburgerMenu
        onSelectPanel={vi.fn()}
        onClose={vi.fn()}
        onNewSession={vi.fn()}
        extensionCount={1}
      />,
    );

    // Should NOT find "Projects" in the menu
    expect(screen.queryByText('Projects')).not.toBeInTheDocument();

    // Should still have other items
    expect(screen.getByText('Files')).toBeInTheDocument();
    expect(screen.getByText('Git')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Extensions')).toBeInTheDocument();
  });
});

// ─── MobileExtensionTabs: Tab switching ───

describe('MobileExtensionTabs', () => {
  const mockExtensions = [
    {
      name: 'work-report',
      displayName: 'Work Report',
      panelUrl: '/extensions/work-report/ui/index.html',
      panelConfig: { defaultPosition: 'right' as const, icon: 'file-text' },
      boardCommands: ['report.file_changed'],
      panelKey: 'ext:work-report',
    },
    {
      name: 'frontend-design',
      displayName: 'Frontend Design',
      panelUrl: '/extensions/frontend-design/ui/index.html',
      panelConfig: { defaultPosition: 'right' as const, icon: 'layout' },
      boardCommands: [],
      panelKey: 'ext:frontend-design',
    },
  ];

  it('renders tab bar with enabled extension names', async () => {
    const { MobileExtensionTabs } = await import('../../src/components/MobileExtensionTabs');
    const ref = { current: null };

    render(
      <MobileExtensionTabs
        extensions={mockExtensions}
        enabledExtensions={['work-report', 'frontend-design']}
        activeExtensionName="work-report"
        sessionId="test-session"
        onSelectExtension={vi.fn()}
        onManageExtensions={vi.fn()}
        onClose={vi.fn()}
        extensionPanelRef={ref}
      />,
    );

    expect(screen.getByText('Work Report')).toBeInTheDocument();
    expect(screen.getByText('Frontend Design')).toBeInTheDocument();
    expect(screen.getByLabelText('Manage extensions')).toBeInTheDocument();
  });

  it('calls onSelectExtension when a different tab is clicked', async () => {
    const { MobileExtensionTabs } = await import('../../src/components/MobileExtensionTabs');
    const onSelectExtension = vi.fn();
    const ref = { current: null };

    render(
      <MobileExtensionTabs
        extensions={mockExtensions}
        enabledExtensions={['work-report', 'frontend-design']}
        activeExtensionName="work-report"
        sessionId="test-session"
        onSelectExtension={onSelectExtension}
        onManageExtensions={vi.fn()}
        onClose={vi.fn()}
        extensionPanelRef={ref}
      />,
    );

    fireEvent.click(screen.getByText('Frontend Design'));
    expect(onSelectExtension).toHaveBeenCalledWith('frontend-design');
  });

  it('calls onManageExtensions when gear icon is clicked', async () => {
    const { MobileExtensionTabs } = await import('../../src/components/MobileExtensionTabs');
    const onManageExtensions = vi.fn();
    const ref = { current: null };

    render(
      <MobileExtensionTabs
        extensions={mockExtensions}
        enabledExtensions={['work-report', 'frontend-design']}
        activeExtensionName="work-report"
        sessionId="test-session"
        onSelectExtension={vi.fn()}
        onManageExtensions={onManageExtensions}
        onClose={vi.fn()}
        extensionPanelRef={ref}
      />,
    );

    fireEvent.click(screen.getByLabelText('Manage extensions'));
    expect(onManageExtensions).toHaveBeenCalledOnce();
  });

  it('only shows enabled extensions in the tab bar', async () => {
    const { MobileExtensionTabs } = await import('../../src/components/MobileExtensionTabs');
    const ref = { current: null };

    render(
      <MobileExtensionTabs
        extensions={mockExtensions}
        enabledExtensions={['work-report']}
        activeExtensionName="work-report"
        sessionId="test-session"
        onSelectExtension={vi.fn()}
        onManageExtensions={vi.fn()}
        onClose={vi.fn()}
        extensionPanelRef={ref}
      />,
    );

    expect(screen.getByText('Work Report')).toBeInTheDocument();
    expect(screen.queryByText('Frontend Design')).not.toBeInTheDocument();
  });

  it('renders with single extension plus gear icon', async () => {
    const { MobileExtensionTabs } = await import('../../src/components/MobileExtensionTabs');
    const ref = { current: null };

    render(
      <MobileExtensionTabs
        extensions={mockExtensions}
        enabledExtensions={['frontend-design']}
        activeExtensionName="frontend-design"
        sessionId="test-session"
        onSelectExtension={vi.fn()}
        onManageExtensions={vi.fn()}
        onClose={vi.fn()}
        extensionPanelRef={ref}
      />,
    );

    expect(screen.getByText('Frontend Design')).toBeInTheDocument();
    expect(screen.getByLabelText('Manage extensions')).toBeInTheDocument();
  });
});
