import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { files as filesApi } from '../../src/services/api';

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

import { FileTree } from '../../src/components/FileTree';

const treeMock = vi.mocked(filesApi.tree);

describe('FileTree — copy-path button', () => {
  let clipboardWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    // Set up clipboard mock
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteText },
    });

    // Set up the tree API mock to return sample entries
    treeMock.mockResolvedValue({
      path: '/',
      entries: [
        { name: 'src', type: 'directory' as const },
        { name: 'README.md', type: 'file' as const, size: 1024 },
        { name: 'index.ts', type: 'file' as const, size: 512 },
      ],
    });
  });

  async function renderTree(onFileSelect = vi.fn()) {
    await act(async () => {
      render(<FileTree sessionId="s1" onFileSelect={onFileSelect} />);
    });
    // Wait for the async loadDirectory to resolve and re-render
    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument();
    });
    return onFileSelect;
  }

  it('shows copy-path button ("cp") for file nodes', async () => {
    await renderTree();

    // File nodes should have a "cp" button with title "Copy path"
    const cpButtons = screen.getAllByTitle('Copy path');
    expect(cpButtons.length).toBeGreaterThanOrEqual(1);
    expect(cpButtons[0]).toHaveTextContent('cp');
  });

  it('calls navigator.clipboard.writeText with correct path on click', async () => {
    await renderTree();

    // Locate the row containing index.ts and find its copy button
    const indexTsNode = screen.getByText('index.ts');
    const row = indexTsNode.closest('.group')!;
    const cpButton = row.querySelector('button[title="Copy path"]')!;

    await act(async () => {
      fireEvent.click(cpButton);
    });

    expect(clipboardWriteText).toHaveBeenCalledWith('index.ts');
  });

  it('shows confirmation state (checkmark) after successful copy', async () => {
    await renderTree();

    const readmeNode = screen.getByText('README.md');
    const row = readmeNode.closest('.group')!;
    const cpButton = row.querySelector('button[title="Copy path"]')!;
    expect(cpButton).toHaveTextContent('cp');

    await act(async () => {
      fireEvent.click(cpButton);
    });

    // After copy, the button text changes to checkmark and title to "Copied!"
    await waitFor(() => {
      const copiedButton = row.querySelector('button[title="Copied!"]');
      expect(copiedButton).not.toBeNull();
      expect(copiedButton).toHaveTextContent('\u2713');
    });
  });

  it('does NOT show a copy-path button for directory nodes', async () => {
    await renderTree();

    const srcNode = screen.getByText('src');
    const row = srcNode.closest('.group')!;
    const cpButton = row.querySelector('button[title="Copy path"]');
    expect(cpButton).toBeNull();
  });

  it('does not trigger file selection when copy button is clicked', async () => {
    const onFileSelect = vi.fn();
    await renderTree(onFileSelect);

    const indexTsNode = screen.getByText('index.ts');
    const row = indexTsNode.closest('.group')!;
    const cpButton = row.querySelector('button[title="Copy path"]')!;

    await act(async () => {
      fireEvent.click(cpButton);
    });

    // stopPropagation prevents onFileSelect from firing
    expect(onFileSelect).not.toHaveBeenCalled();
  });
});
