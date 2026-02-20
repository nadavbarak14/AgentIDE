import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { files as filesApi, comments as commentsApi } from '../../src/services/api';

// Mock Monaco Editor — requires browser APIs unavailable in jsdom
vi.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: () => <div data-testid="monaco-editor" />,
}));

// Mock the api service
vi.mock('../../src/services/api', () => ({
  files: {
    tree: vi.fn(),
    content: vi.fn(),
    diff: vi.fn(),
    save: vi.fn(),
    search: vi.fn(),
  },
  comments: {
    list: vi.fn(),
    create: vi.fn(),
    deliver: vi.fn(),
    deliverOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

import { FileViewer } from '../../src/components/FileViewer';

const contentMock = vi.mocked(filesApi.content);
const commentsListMock = vi.mocked(commentsApi.list);

describe('FileViewer — copy-path button in tab bar', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    // Set up clipboard mock
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteText },
    });

    // Set up API mocks
    contentMock.mockResolvedValue({
      path: 'src/App.tsx',
      content: 'const x = 1;',
      language: 'typescript',
      size: 128,
    });
    commentsListMock.mockResolvedValue({ comments: [] });
  });

  async function renderViewer(overrides: Partial<{
    filePath: string;
    fileTabs: string[];
    activeTabIndex: number;
    onTabSelect: ReturnType<typeof vi.fn>;
    onTabClose: ReturnType<typeof vi.fn>;
    onClose: ReturnType<typeof vi.fn>;
  }> = {}) {
    const props = {
      sessionId: 's1',
      filePath: overrides.filePath ?? 'src/App.tsx',
      fileTabs: overrides.fileTabs ?? ['src/App.tsx', 'src/index.ts'],
      activeTabIndex: overrides.activeTabIndex ?? 0,
      onTabSelect: overrides.onTabSelect ?? vi.fn(),
      onTabClose: overrides.onTabClose ?? vi.fn(),
      onClose: overrides.onClose ?? vi.fn(),
    };

    await act(async () => {
      render(<FileViewer {...props} />);
    });

    // Wait for the file content to load and editor to appear
    await waitFor(() => {
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument();
    });

    return props;
  }

  it('shows copy-path SVG button in the active tab', async () => {
    await renderViewer();

    const copyButton = screen.getByTitle('Copy file path');
    expect(copyButton).toBeInTheDocument();

    // It should contain an SVG element
    const svg = copyButton.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('does NOT show copy-path button on inactive tabs', async () => {
    await renderViewer();

    // Only the active tab gets a copy-path button
    const copyButtons = screen.getAllByTitle('Copy file path');
    expect(copyButtons).toHaveLength(1);
  });

  it('calls navigator.clipboard.writeText with the tab path on click', async () => {
    await renderViewer();

    const copyButton = screen.getByTitle('Copy file path');

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    expect(clipboardWriteText).toHaveBeenCalledWith('src/App.tsx');
  });

  it('does not switch tabs when copy button is clicked', async () => {
    const onTabSelect = vi.fn();
    await renderViewer({ onTabSelect });

    const copyButton = screen.getByTitle('Copy file path');

    await act(async () => {
      fireEvent.click(copyButton);
    });

    // stopPropagation prevents tab click handler from firing
    expect(onTabSelect).not.toHaveBeenCalled();
  });

  it('copies the correct path when second tab is active', async () => {
    contentMock.mockResolvedValue({
      path: 'src/index.ts',
      content: 'export {};',
      language: 'typescript',
      size: 64,
    });

    await renderViewer({
      filePath: 'src/index.ts',
      activeTabIndex: 1,
    });

    const copyButton = screen.getByTitle('Copy file path');

    await act(async () => {
      fireEvent.click(copyButton);
    });

    expect(clipboardWriteText).toHaveBeenCalledWith('src/index.ts');
  });
});
