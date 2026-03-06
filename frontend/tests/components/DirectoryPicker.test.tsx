import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Mock the API module
const mockList = vi.fn();
const mockWorkerDirs = vi.fn();
const mockCreate = vi.fn();

vi.mock('../../src/services/api', () => ({
  directories: {
    list: (...args: unknown[]) => mockList(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
  workers: {
    directories: (...args: unknown[]) => mockWorkerDirs(...args),
  },
}));

import { DirectoryPicker } from '../../src/components/DirectoryPicker';

const homeResult = {
  path: '/home/testuser',
  entries: [
    { name: 'projects', path: '/home/testuser/projects' },
    { name: 'Documents', path: '/home/testuser/Documents' },
    { name: 'Desktop', path: '/home/testuser/Desktop' },
  ],
  exists: true,
};

const projectsResult = {
  path: '/home/testuser/projects',
  entries: [
    { name: 'my-app', path: '/home/testuser/projects/my-app' },
    { name: 'api-server', path: '/home/testuser/projects/api-server' },
  ],
  exists: true,
};

const emptyResult = {
  path: '/home/testuser/projects/my-app',
  entries: [],
  exists: true,
};

const notFoundResult = {
  path: '/nonexistent',
  entries: [],
  exists: false,
};

describe('DirectoryPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue(homeResult);
  });

  it('renders path input', () => {
    render(<DirectoryPicker value="" onChange={vi.fn()} />);
    expect(screen.getByTestId('directory-path-input')).toBeDefined();
  });

  it('opens browser with home directory contents on input focus', async () => {
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('directory-browser')).toBeDefined();
    });

    expect(screen.getByTestId('folder-projects')).toBeDefined();
    expect(screen.getByTestId('folder-Documents')).toBeDefined();
    expect(screen.getByTestId('folder-Desktop')).toBeDefined();
  });

  it('navigates into a folder on click and updates breadcrumbs', async () => {
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('folder-projects')).toBeDefined();
    });

    mockList.mockResolvedValue(projectsResult);

    await act(async () => {
      fireEvent.click(screen.getByTestId('folder-projects'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('folder-my-app')).toBeDefined();
    });

    // Check breadcrumbs contain "projects"
    const breadcrumbTrail = screen.getByTestId('breadcrumb-trail');
    expect(breadcrumbTrail.textContent).toContain('projects');
  });

  it('navigates back on back button click', async () => {
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    // Open browser
    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('folder-projects')).toBeDefined();
    });

    // Navigate into projects
    mockList.mockResolvedValue(projectsResult);
    await act(async () => {
      fireEvent.click(screen.getByTestId('folder-projects'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('folder-my-app')).toBeDefined();
    });

    // Back button should be enabled now
    const backBtn = screen.getByTestId('browser-back-btn');
    expect(backBtn.hasAttribute('disabled')).toBe(false);

    // Click back
    mockList.mockResolvedValue(homeResult);
    await act(async () => {
      fireEvent.click(backBtn);
    });
    await waitFor(() => {
      expect(screen.getByTestId('folder-projects')).toBeDefined();
    });
  });

  it('back button is disabled at root', async () => {
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('browser-back-btn')).toBeDefined();
    });

    expect(screen.getByTestId('browser-back-btn').hasAttribute('disabled')).toBe(true);
  });

  it('navigates to breadcrumb segment on click', async () => {
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    // Open and navigate into projects
    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('folder-projects')).toBeDefined();
    });

    mockList.mockResolvedValue(projectsResult);
    await act(async () => {
      fireEvent.click(screen.getByTestId('folder-projects'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('folder-my-app')).toBeDefined();
    });

    // Click the root breadcrumb to go back to root
    mockList.mockResolvedValue(homeResult);
    await act(async () => {
      fireEvent.click(screen.getByTestId('breadcrumb-0'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('folder-projects')).toBeDefined();
    });
  });

  it('calls onChange with currentPath when "Select this folder" is clicked', async () => {
    const onChange = vi.fn();
    render(<DirectoryPicker value="" onChange={onChange} />);

    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('select-folder-btn')).toBeDefined();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('select-folder-btn'));
    });

    expect(onChange).toHaveBeenCalledWith('/home/testuser');
  });

  it('shows "No subdirectories" for empty directories', async () => {
    mockList.mockResolvedValue(emptyResult);
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('empty-directory')).toBeDefined();
    });

    expect(screen.getByTestId('empty-directory').textContent).toBe('No subdirectories');
    // Select button should still be available
    expect(screen.getByTestId('select-folder-btn')).toBeDefined();
  });

  it('shows error for non-existent paths', async () => {
    mockList.mockResolvedValue(notFoundResult);
    render(<DirectoryPicker value="" onChange={vi.fn()} />);

    await act(async () => {
      fireEvent.focus(screen.getByTestId('directory-path-input'));
    });

    await waitFor(() => {
      expect(screen.getByTestId('browser-error')).toBeDefined();
    });

    expect(screen.getByTestId('browser-error').textContent).toBe('Path not found');
  });
});
