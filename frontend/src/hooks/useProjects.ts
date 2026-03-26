import { useState, useEffect, useCallback, useRef } from 'react';
import { projects as projectsApi, type ProjectTree } from '../services/api';

export function useProjects(workerId?: string) {
  const [projectTree, setProjectTree] = useState<ProjectTree[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  const fetchProjects = useCallback(async () => {
    try {
      setError(null);
      const data = await projectsApi.tree(workerId);
      setProjectTree(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchProjects();
  }, [fetchProjects]);

  // Poll every 5 seconds for status updates
  useEffect(() => {
    const interval = setInterval(fetchProjects, 5000);
    return () => clearInterval(interval);
  }, [fetchProjects]);

  const selectProject = useCallback((id: string | null) => {
    setSelectedProjectId(id);
  }, []);

  // Find project in tree (recursive)
  const findProject = useCallback((id: string): ProjectTree | null => {
    function search(nodes: ProjectTree[]): ProjectTree | null {
      for (const node of nodes) {
        if (node.id === id) return node;
        const found = search(node.children);
        if (found) return found;
      }
      return null;
    }
    return search(projectTree);
  }, [projectTree]);

  return {
    projectTree,
    loading,
    error,
    selectedProjectId,
    selectedProject: selectedProjectId ? findProject(selectedProjectId) : null,
    selectProject,
    refresh: fetchProjects,
    findProject,
  };
}
