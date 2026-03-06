import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Mock API
const mockProjectList = vi.fn();

vi.mock('../../src/services/api', () => ({
  projects: {
    list: () => mockProjectList(),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue(undefined),
  },
  directories: {
    list: vi.fn().mockResolvedValue({ path: '/home/testuser', entries: [], exists: true }),
    create: vi.fn().mockResolvedValue({ path: '/tmp/new', created: true, exists: true }),
  },
  workers: {
    directories: vi.fn().mockResolvedValue({ path: '/', entries: [], exists: true }),
  },
}));

import { ProjectPicker } from '../../src/components/ProjectPicker';

const makeProject = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  displayName: 'My App',
  directoryPath: '/home/testuser/projects/my-app',
  workerId: 'local',
  workerType: 'local' as const,
  workerName: '',
  workerStatus: 'connected' as const,
  bookmarked: false,
  position: 0,
  ...overrides,
});

describe('ProjectPicker', () => {
  const defaultProps = {
    onSelect: vi.fn(),
    selectedDirectory: '',
    onDirectoryChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectList.mockResolvedValue({
      projects: [
        makeProject({ id: 'p1', displayName: 'Work API', directoryPath: '/home/testuser/work/api' }),
        makeProject({ id: 'p2', displayName: 'Personal API', directoryPath: '/home/testuser/personal/api' }),
        makeProject({ id: 'p3', displayName: 'Short', directoryPath: '/home/testuser/myproject' }),
        makeProject({ id: 'p4', displayName: 'Deep Project', directoryPath: '/home/testuser/a/b/c/d/e/deep' }),
      ],
    });
  });

  // --- US2: Path visibility ---

  describe('path abbreviation', () => {
    it('replaces home directory prefix with ~', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Work API')).toBeDefined();
      });

      // ~/work/api should be shown (3 segments, under 4 limit)
      expect(screen.getByText('~/work/api')).toBeDefined();
    });

    it('shows short paths in full', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Short')).toBeDefined();
      });

      expect(screen.getByText('~/myproject')).toBeDefined();
    });

    it('distinguishes similar paths', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Work API')).toBeDefined();
      });

      // Both should be visible and distinct
      expect(screen.getByText('~/work/api')).toBeDefined();
      expect(screen.getByText('~/personal/api')).toBeDefined();
    });

    it('truncates long paths from the left preserving last 3 segments', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Deep Project')).toBeDefined();
      });

      // /home/testuser/a/b/c/d/e/deep → ~/a/b/c/d/e/deep has 7 segments (> 4)
      // Should show .../d/e/deep
      expect(screen.getByText('.../d/e/deep')).toBeDefined();
    });

    it('shows full path in tooltip on hover', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByText('Work API')).toBeDefined();
      });

      // Find the path element and check its title attribute
      const pathEl = screen.getByText('~/work/api');
      expect(pathEl.getAttribute('title')).toBe('/home/testuser/work/api');
    });
  });

  // --- US3: Prominent browse button ---

  describe('browse button', () => {
    it('renders browse button with folder icon above project list', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('browse-folders-btn')).toBeDefined();
      });

      const browseBtn = screen.getByTestId('browse-folders-btn');
      expect(browseBtn.textContent).toContain('Browse folders...');

      // Button should contain an SVG icon
      const svg = browseBtn.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('browse button appears before project list in DOM', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('browse-folders-btn')).toBeDefined();
      });

      const browseBtn = screen.getByTestId('browse-folders-btn');
      const projectList = screen.getByTestId('project-list');

      // Browse button should come before project list in DOM order
      const comparison = browseBtn.compareDocumentPosition(projectList);
      // DOCUMENT_POSITION_FOLLOWING = 4
      expect(comparison & 4).toBe(4);
    });

    it('is the primary CTA when no projects exist', async () => {
      mockProjectList.mockResolvedValue({ projects: [] });

      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('browse-folders-btn')).toBeDefined();
      });

      const browseBtn = screen.getByTestId('browse-folders-btn');
      // Should have blue-ish styling for primary CTA
      expect(browseBtn.className).toContain('text-blue-400');
    });
  });

  // --- US4: Selected state & list height ---

  describe('selected state', () => {
    it('clear button uses SVG icon', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} selectedDirectory="/home/testuser/projects/my-app" />);
      });

      const clearBtn = screen.getByTestId('clear-directory-btn');
      expect(clearBtn).toBeDefined();

      // Should have SVG, not plain "x" text
      const svg = clearBtn.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(clearBtn.textContent).toBe(''); // No text content — icon only
    });

    it('selected directory has tooltip with full path', async () => {
      const fullPath = '/home/testuser/projects/my-app';
      await act(async () => {
        render(<ProjectPicker {...defaultProps} selectedDirectory={fullPath} />);
      });

      const pathSpan = screen.getByText(fullPath);
      expect(pathSpan.getAttribute('title')).toBe(fullPath);
    });
  });

  describe('project list height', () => {
    it('project list has max-h-60 class', async () => {
      await act(async () => {
        render(<ProjectPicker {...defaultProps} />);
      });

      await waitFor(() => {
        expect(screen.getByTestId('project-list')).toBeDefined();
      });

      const projectList = screen.getByTestId('project-list');
      expect(projectList.className).toContain('max-h-60');
    });
  });
});
