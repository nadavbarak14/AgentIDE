import React from 'react';
import type { ProjectTree, Session } from '../services/api';

interface ProjectSidePanelProps {
  projects: ProjectTree[];
  sessions: Session[];
  currentSessionId: string | null;
  selectedProjectId: string | null;
  onSelectProject: (id: string | null) => void;
  onOpenProject: (id: string) => void;
  onFocusSession: (id: string) => void;
  onStartAgent: (projectId: string, workDir: string, project: ProjectTree) => void;
  onNewSession: () => void;
  onCreateProject: () => void;
  onCollapse: () => void;
}

function getProjectSessions(project: ProjectTree, sessions: Session[]): Session[] {
  const pd = project.directoryPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!pd) return [];
  return sessions.filter(s => {
    const nd = s.workingDirectory.replace(/\\/g, '/').replace(/\/+$/, '');
    return nd === pd || nd.startsWith(pd + '/');
  });
}

export function ProjectSidePanel({
  projects,
  sessions,
  currentSessionId,
  selectedProjectId,
  onSelectProject,
  onOpenProject,
  onFocusSession,
  onStartAgent,
  onNewSession: _onNewSession,
  onCreateProject,
  onCollapse,
}: ProjectSidePanelProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-2 pt-2 pb-1 flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onCollapse}
          className="text-gray-600 hover:text-gray-300 transition p-0.5"
          title="Collapse sidebar"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Projects</h2>
        <button
          onClick={onCreateProject}
          className="text-[10px] text-blue-400 hover:text-blue-300 transition"
          title="Add project"
        >+ Project</button>
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-2">
        {projects.map((project) => {
          const isSelected = project.id === selectedProjectId;
          const projectSessions = getProjectSessions(project, sessions);
          const workDir = project.directoryPath
            || (project.githubRepo ? `/home/ubuntu/projects/${project.githubRepo.split('/').pop()}` : '');

          return (
            <div key={project.id} className="mb-0.5">
              {/* Project header — click to expand, double-click to open project page */}
              <div
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded transition text-left cursor-pointer group ${
                  isSelected ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                }`}
                onClick={() => onSelectProject(isSelected ? null : project.id)}
                onDoubleClick={() => onOpenProject(project.id)}
              >
                <svg
                  className={`w-3 h-3 flex-shrink-0 text-gray-500 transition-transform ${isSelected ? 'rotate-90' : ''}`}
                  fill="currentColor" viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                </svg>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  projectSessions.some(s => s.status === 'active') ? 'bg-green-500' : projectSessions.length > 0 ? 'bg-gray-500' : 'bg-gray-700'
                }`} />
                <span className="truncate flex-1">{project.displayName}</span>
                {projectSessions.filter(s => s.status === 'active').length > 0 && (
                  <span className="text-[10px] text-green-500">{projectSessions.filter(s => s.status === 'active').length}</span>
                )}
              </div>

              {/* Expanded: sessions + actions */}
              {isSelected && (
                <div className="ml-4 border-l border-gray-700 pl-2 mt-0.5 space-y-0.5">
                  {projectSessions.filter(s => s.status === 'active').map(s => (
                    <button
                      key={s.id}
                      onClick={() => onFocusSession(s.id)}
                      className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded transition text-left ${
                        s.id === currentSessionId ? 'bg-blue-600/30 text-blue-300' : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        s.needsInput ? 'bg-yellow-400 animate-pulse' : 'bg-green-500'
                      }`} />
                      <span className="truncate">{s.title || 'Untitled'}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => { if (workDir) onStartAgent(project.id, workDir, project); }}
                    className="w-full text-left text-xs text-blue-400/70 hover:text-blue-300 px-2 py-1 transition"
                  >
                    + new agent
                  </button>
                  <button
                    onClick={() => onOpenProject(project.id)}
                    className="w-full text-left text-xs text-gray-500 hover:text-gray-300 px-2 py-1 transition"
                  >
                    Open project
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {projects.length === 0 && (
          <p className="text-xs text-gray-500 px-2 py-3">No projects yet</p>
        )}
      </div>
    </div>
  );
}
