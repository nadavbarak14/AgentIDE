import React, { useState } from 'react';
import type { ProjectTree } from '../services/api';

interface ProjectCardProps {
  project: ProjectTree;
  onSelect: (projectId: string) => void;
  onNewAgent?: (projectId: string) => void;
  onViewTickets?: (projectId: string) => void;
  onOpenGithub?: (githubRepo: string) => void;
}

export function ProjectCard({ project, onSelect, onNewAgent, onViewTickets, onOpenGithub }: ProjectCardProps) {
  const idleAgents = Math.max(0, project.sessionCount - project.activeAgents - project.waitingAgents);
  const [childrenExpanded, setChildrenExpanded] = useState(false);

  return (
    <div
      data-testid={`project-card-${project.id}`}
      className="bg-gray-800 rounded-lg border border-gray-700 p-4 cursor-pointer hover:border-blue-500 transition"
      onClick={() => onSelect(project.id)}
    >
      {/* Top row: name + github repo */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-lg font-semibold text-white truncate">{project.displayName}</h3>
        {project.githubRepo && (
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded flex-shrink-0 truncate max-w-[160px]">
            {project.githubRepo}
          </span>
        )}
      </div>

      {/* Status row: agent badges */}
      <div className="flex items-center gap-2 mb-3">
        {project.activeAgents > 0 && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            {project.activeAgents} active
          </span>
        )}
        {project.waitingAgents > 0 && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
            {project.waitingAgents} waiting
          </span>
        )}
        {idleAgents > 0 && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-600/30 text-gray-400">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
            {idleAgents} idle
          </span>
        )}
        {project.sessionCount === 0 && (
          <span className="text-xs text-gray-500">No agents</span>
        )}
      </div>

      {/* Subprojects indicator with expandable preview */}
      {project.children.length > 0 && (
        <div className="mb-3">
          <button
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition"
            onClick={(e) => {
              e.stopPropagation();
              setChildrenExpanded((prev) => !prev);
            }}
          >
            <span className="text-gray-500">{childrenExpanded ? '\u25BE' : '\u25B8'}</span>
            <span className="inline-flex items-center gap-1">
              <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                {project.children.length}
              </span>
              subproject{project.children.length !== 1 ? 's' : ''}
            </span>
          </button>
          {childrenExpanded && (
            <ul className="mt-1.5 ml-4 space-y-1">
              {project.children.map((child) => (
                <li
                  key={child.id}
                  className="text-xs text-gray-400 flex items-center gap-1.5"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      child.activeAgents > 0
                        ? 'bg-green-500'
                        : child.waitingAgents > 0
                          ? 'bg-yellow-500'
                          : 'bg-gray-500'
                    }`}
                  />
                  <span className="truncate">{child.displayName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="flex items-center gap-2 border-t border-gray-700 pt-3">
        {onNewAgent && (
          <button
            className="text-sm text-blue-400 hover:text-blue-300 transition"
            onClick={(e) => {
              e.stopPropagation();
              onNewAgent(project.id);
            }}
          >
            + New Agent
          </button>
        )}
        {project.githubRepo && onViewTickets && (
          <button
            className="text-sm text-gray-400 hover:text-gray-300 transition"
            onClick={(e) => {
              e.stopPropagation();
              onViewTickets(project.id);
            }}
          >
            Tickets
          </button>
        )}
        {project.githubRepo && onOpenGithub && (
          <button
            className="text-sm text-gray-400 hover:text-gray-300 transition"
            onClick={(e) => {
              e.stopPropagation();
              onOpenGithub(project.githubRepo!);
            }}
          >
            GitHub
          </button>
        )}
      </div>
    </div>
  );
}
