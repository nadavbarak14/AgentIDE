import React, { useState, useCallback } from 'react';
import type { ProjectTree } from '../services/api';

interface ProjectSidebarProps {
  projects: ProjectTree[];
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
}

interface TreeNodeProps {
  project: ProjectTree;
  depth: number;
  selectedProjectId: string | null;
  onSelectProject: (id: string) => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
}

function getStatusColor(project: ProjectTree): string {
  if (project.activeAgents > 0) return 'bg-green-500';
  if (project.waitingAgents > 0) return 'bg-yellow-500';
  return 'bg-gray-500';
}

function TreeNode({
  project,
  depth,
  selectedProjectId,
  onSelectProject,
  expandedIds,
  toggleExpanded,
}: TreeNodeProps) {
  const isSelected = project.id === selectedProjectId;
  const hasChildren = project.children.length > 0;
  const isExpanded = expandedIds.has(project.id);

  return (
    <div>
      <button
        className={`w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded transition ${
          isSelected
            ? 'bg-gray-700 text-white'
            : 'text-gray-300 hover:bg-gray-700/50'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelectProject(project.id)}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <span
            className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-200 flex-shrink-0 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(project.id);
            }}
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* Status dot */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor(project)}`}
        />

        {/* Project name */}
        <span className="truncate flex-1 text-left">{project.displayName}</span>

        {/* GitHub repo tag */}
        {project.githubRepo && (
          <span className="text-[10px] text-gray-500 bg-gray-700/60 px-1.5 py-0.5 rounded flex-shrink-0 truncate max-w-[80px]">
            {project.githubRepo.split('/').pop()}
          </span>
        )}
      </button>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {project.children.map((child) => (
            <TreeNode
              key={child.id}
              project={child}
              depth={depth + 1}
              selectedProjectId={selectedProjectId}
              onSelectProject={onSelectProject}
              expandedIds={expandedIds}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProjectSidebar({
  projects,
  selectedProjectId,
  onSelectProject,
}: ProjectSidebarProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Auto-expand projects that have children by default
    const ids = new Set<string>();
    function collectParents(nodes: ProjectTree[]) {
      for (const node of nodes) {
        if (node.children.length > 0) {
          ids.add(node.id);
          collectParents(node.children);
        }
      }
    }
    collectParents(projects);
    return ids;
  });

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  if (projects.length === 0) {
    return (
      <div className="p-3 text-xs text-gray-500">No projects</div>
    );
  }

  return (
    <nav className="py-2 overflow-y-auto" data-testid="project-sidebar">
      <div className="px-3 pb-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Projects
        </h2>
      </div>
      <div className="space-y-0.5">
        {projects.map((project) => (
          <TreeNode
            key={project.id}
            project={project}
            depth={0}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
            expandedIds={expandedIds}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </div>
    </nav>
  );
}
