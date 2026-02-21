import { useState, useEffect, useRef, useCallback } from 'react';
import { projects, type Project } from '../services/api';
import { DirectoryPicker } from './DirectoryPicker';

interface ProjectPickerProps {
  onSelect: (directoryPath: string, workerId: string | null, projectId?: string) => void;
  selectedDirectory: string;
  onDirectoryChange: (value: string) => void;
  workerId?: string;
  isRemote?: boolean;
}

export function ProjectPicker({ onSelect, selectedDirectory, onDirectoryChange, workerId, isRemote }: ProjectPickerProps) {
  const [projectList, setProjectList] = useState<Project[]>([]);
  const [showBrowser, setShowBrowser] = useState(false);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setLoading(true);
    projects.list()
      .then((res) => setProjectList(res.projects))
      .catch(() => setProjectList([]))
      .finally(() => setLoading(false));
  }, []);

  const bookmarked = projectList.filter((p) => p.bookmarked);
  const recent = projectList.filter((p) => !p.bookmarked);
  const hasProjects = projectList.length > 0;

  const handleProjectClick = (project: Project) => {
    onSelect(project.directoryPath, project.workerId, project.id);
    setShowBrowser(false);
  };

  const handleProjectUpdate = useCallback((updated: Project) => {
    setProjectList((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  }, []);

  const handleProjectDelete = useCallback((projectId: string) => {
    setProjectList((prev) => prev.filter((p) => p.id !== projectId));
  }, []);

  // Drag-and-drop for bookmarked projects
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);

  const handleDragStart = (projectId: string) => {
    dragItem.current = projectId;
  };

  const handleDragOver = (e: React.DragEvent, projectId: string) => {
    e.preventDefault();
    dragOverItem.current = projectId;
  };

  const handleDrop = async () => {
    if (!dragItem.current || !dragOverItem.current || dragItem.current === dragOverItem.current) return;

    const newBookmarked = [...bookmarked];
    const dragIndex = newBookmarked.findIndex((p) => p.id === dragItem.current);
    const dropIndex = newBookmarked.findIndex((p) => p.id === dragOverItem.current);

    if (dragIndex === -1 || dropIndex === -1) return;

    const [removed] = newBookmarked.splice(dragIndex, 1);
    newBookmarked.splice(dropIndex, 0, removed);

    // Update positions
    const updates = newBookmarked.map((p, i) => ({ ...p, position: i }));
    setProjectList((prev) => {
      const nonBookmarked = prev.filter((p) => !p.bookmarked);
      return [...updates, ...nonBookmarked];
    });

    // Persist position updates
    for (const p of updates) {
      try {
        await projects.update(p.id, { position: p.position });
      } catch { /* ignore */ }
    }

    dragItem.current = null;
    dragOverItem.current = null;
  };

  const abbreviatePath = (fullPath: string) => {
    const segments = fullPath.split('/').filter(Boolean);
    if (segments.length <= 2) return fullPath;
    return '.../' + segments.slice(-2).join('/');
  };

  if (loading) {
    return (
      <div className="py-2 text-center text-xs text-gray-500">
        Loading projects...
      </div>
    );
  }

  // Browse mode — DirectoryPicker stays visible while user navigates
  if (showBrowser) {
    return (
      <div className="space-y-1">
        <DirectoryPicker
          value={selectedDirectory}
          onChange={onDirectoryChange}
          placeholder="Browse for a directory..."
          workerId={workerId}
          isRemote={isRemote}
        />
        <button
          type="button"
          onClick={() => setShowBrowser(false)}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {hasProjects ? 'Back to projects' : 'Back'}
        </button>
      </div>
    );
  }

  // Selected directory display (only when NOT in browse mode)
  if (selectedDirectory) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-900 border border-gray-600 rounded text-sm">
          <span className="text-white truncate flex-1">{selectedDirectory}</span>
          <button
            type="button"
            onClick={() => {
              onSelect('', null);
              onDirectoryChange('');
            }}
            className="text-gray-500 hover:text-gray-300 flex-shrink-0 text-xs"
          >
            x
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Project list (when projects exist) */}
      {hasProjects && (
        <div className="bg-gray-900 border border-gray-600 rounded max-h-40 overflow-y-auto">
          {/* Bookmarked / Favorites (draggable) */}
          {bookmarked.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-850 sticky top-0">
                Favorites
              </div>
              {bookmarked.map((p) => (
                <div
                  key={p.id}
                  draggable
                  onDragStart={() => handleDragStart(p.id)}
                  onDragOver={(e) => handleDragOver(e, p.id)}
                  onDrop={handleDrop}
                  className="cursor-grab active:cursor-grabbing"
                >
                  <ProjectRow project={p} onClick={handleProjectClick} abbreviatePath={abbreviatePath} onUpdate={handleProjectUpdate} onDelete={handleProjectDelete} />
                </div>
              ))}
            </div>
          )}

          {/* Recent */}
          {recent.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-850 sticky top-0">
                Recent
              </div>
              {recent.map((p) => (
                <ProjectRow key={p.id} project={p} onClick={handleProjectClick} abbreviatePath={abbreviatePath} onUpdate={handleProjectUpdate} onDelete={handleProjectDelete} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state — no projects yet */}
      {!hasProjects && (
        <div className="bg-gray-900 border border-gray-600 rounded px-3 py-2.5">
          <p className="text-xs text-gray-400 mb-0.5">No recent projects</p>
          <p className="text-[11px] text-gray-500">Browse for a directory to create your first session. Projects are tracked automatically.</p>
        </div>
      )}

      {/* Browse button */}
      <button
        type="button"
        onClick={() => setShowBrowser(true)}
        className="w-full text-xs text-gray-400 hover:text-gray-300 py-1.5 text-center border border-dashed border-gray-600 rounded hover:border-gray-500"
      >
        Browse for directory...
      </button>
    </div>
  );
}

function ProjectRow({
  project,
  onClick,
  abbreviatePath,
  onUpdate,
  onDelete,
}: {
  project: Project;
  onClick: (project: Project) => void;
  abbreviatePath: (path: string) => string;
  onUpdate: (project: Project) => void;
  onDelete: (projectId: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.displayName);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Focus input when renaming
  useEffect(() => {
    if (renaming) inputRef.current?.focus();
  }, [renaming]);

  const handleRename = async () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== project.displayName) {
      try {
        const updated = await projects.update(project.id, { displayName: trimmed });
        onUpdate(updated);
      } catch { /* ignore */ }
    }
    setRenaming(false);
  };

  const handleToggleBookmark = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      const updated = await projects.update(project.id, { bookmarked: !project.bookmarked });
      onUpdate(updated);
    } catch { /* ignore */ }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    try {
      await projects.delete(project.id);
      onDelete(project.id);
    } catch { /* ignore */ }
  };

  if (renaming) {
    return (
      <div className="w-full px-2 py-1.5 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          onBlur={handleRename}
          className="flex-1 px-1.5 py-0.5 text-sm bg-gray-800 border border-blue-500 rounded text-white focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => onClick(project)}
        className="w-full px-2 py-1.5 text-left hover:bg-gray-700/80 flex items-center gap-2"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {project.bookmarked && (
              <span className="text-yellow-400 text-[10px] flex-shrink-0">*</span>
            )}
            <span className="text-sm text-gray-200 truncate font-medium">
              {project.displayName}
            </span>
            {project.workerStatus === 'disconnected' || project.workerStatus === 'error' ? (
              <span className="text-[10px] text-amber-400 flex-shrink-0" title="Worker unavailable">!</span>
            ) : null}
            {project.workerType === 'remote' && project.workerName && (
              <span className="text-[10px] bg-gray-700 text-gray-400 px-1 py-0.5 rounded flex-shrink-0">
                {project.workerName}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 truncate">
            {abbreviatePath(project.directoryPath)}
          </p>
        </div>
      </button>

      {/* Three-dot overflow menu */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-gray-500 hover:text-gray-300 px-1 py-0.5 text-xs"
      >
        ...
      </button>

      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full z-50 w-36 bg-gray-800 border border-gray-600 rounded shadow-lg py-0.5"
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setRenaming(true); setRenameValue(project.displayName); }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
          >
            Rename
          </button>
          <button
            onClick={handleToggleBookmark}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
          >
            {project.bookmarked ? 'Unbookmark' : 'Bookmark'}
          </button>
          <button
            onClick={handleDelete}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-700"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
