import React, { useState, useEffect } from 'react';
import { useProjects } from '../hooks/useProjects';
import { ProjectCard } from './ProjectCard';
import { ProjectSidebar } from './ProjectSidebar';
import { CreateProjectModal } from './CreateProjectModal';
import { sessions as sessionsApi, workers as workersApi, type Session, type Worker } from '../services/api';

interface ProjectListProps {
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onNewAgent?: (projectId: string) => void;
  onViewTickets?: (projectId: string) => void;
  onOpenGithub?: (githubRepo: string) => void;
}

export function ProjectList({
  onSelectProject,
  onCreateProject,
  onNewAgent,
  onViewTickets,
  onOpenGithub,
}: ProjectListProps) {
  const { projectTree, loading, error, refresh } = useProjects();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [defaultWorkerId, setDefaultWorkerId] = useState<string>('');

  // Fetch default worker for project creation
  useEffect(() => {
    workersApi.list().then((list: Worker[]) => {
      if (list.length > 0) setDefaultWorkerId(list[0].id);
    }).catch(() => {});
  }, []);
  const [standaloneSessions, setStandaloneSessions] = useState<Session[]>([]);
  const [standaloneLoading, setStandaloneLoading] = useState(true);
  const [standaloneCollapsed, setStandaloneCollapsed] = useState(true);
  const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchStandalone() {
      try {
        const allSessions = await sessionsApi.list();
        if (!cancelled) {
          setStandaloneSessions(allSessions.filter((s) => s.projectId === null));
        }
      } catch {
        // Standalone section is best-effort; silently ignore errors
      } finally {
        if (!cancelled) setStandaloneLoading(false);
      }
    }
    fetchStandalone();
    const interval = setInterval(fetchStandalone, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <p>Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  // Filter projects to show: if sidebar selection exists, show only that project
  const displayedProjects = sidebarSelectedId
    ? projectTree.filter((p) => p.id === sidebarSelectedId).concat(
        // Also search children recursively for the selected project
        (function findInChildren(nodes: typeof projectTree): typeof projectTree {
          for (const node of nodes) {
            if (node.id === sidebarSelectedId) return [node];
            const found = findInChildren(node.children);
            if (found.length > 0) return found;
          }
          return [];
        })(projectTree.flatMap((p) => p.children)),
      )
    : projectTree;

  // Deduplicate (in case found at top level and in children search)
  const uniqueDisplayed = Array.from(
    new Map(displayedProjects.map((p) => [p.id, p])).values(),
  );

  return (
    <div className="flex-1 flex flex-row overflow-hidden">
      {/* Sidebar */}
      {projectTree.length > 0 && (
        <div className="w-64 min-w-[16rem] border-r border-gray-700 overflow-y-auto bg-gray-900/50 flex-shrink-0">
          <ProjectSidebar
            projects={projectTree}
            selectedProjectId={sidebarSelectedId}
            onSelectProject={(id) =>
              setSidebarSelectedId((prev) => (prev === id ? null : id))
            }
          />
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">Projects</h1>
          <button
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded transition"
            onClick={() => {
              if (defaultWorkerId) {
                setCreateModalOpen(true);
              } else {
                onCreateProject();
              }
            }}
          >
            Create Project
          </button>
        </div>

        {/* Empty state */}
        {projectTree.length === 0 && standaloneSessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <p className="text-lg mb-4">No projects yet. Create one to get started.</p>
            <button
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded transition"
              onClick={() => {
                if (defaultWorkerId) {
                  setCreateModalOpen(true);
                } else {
                  onCreateProject();
                }
              }}
            >
              Create Project
            </button>
          </div>
        )}

        {/* Project grid */}
        {uniqueDisplayed.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {uniqueDisplayed.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onSelect={onSelectProject}
                onNewAgent={onNewAgent}
                onViewTickets={onViewTickets}
                onOpenGithub={onOpenGithub}
              />
            ))}
          </div>
        )}

        {/* Standalone sessions section */}
        {!standaloneLoading && standaloneSessions.length > 0 && (
          <div className="border-t border-gray-700 pt-4">
            <button
              className="flex items-center gap-2 text-sm font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-300 transition mb-3"
              onClick={() => setStandaloneCollapsed((prev) => !prev)}
            >
              <span className="text-gray-500">{standaloneCollapsed ? '\u25B8' : '\u25BE'}</span>
              Standalone Sessions ({standaloneSessions.length})
            </button>

            {!standaloneCollapsed && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {standaloneSessions.map((session) => (
                  <div
                    key={session.id}
                    className="bg-gray-800 rounded-lg border border-gray-700 p-3 text-sm"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          session.status === 'active'
                            ? 'bg-green-500'
                            : session.status === 'crashed'
                              ? 'bg-amber-500'
                              : session.status === 'failed'
                                ? 'bg-red-500'
                                : 'bg-gray-500'
                        }`}
                      />
                      <span className="text-white truncate">{session.title || 'Untitled'}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{session.workingDirectory}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => refresh()}
        workerId={defaultWorkerId}
      />
    </div>
  );
}
