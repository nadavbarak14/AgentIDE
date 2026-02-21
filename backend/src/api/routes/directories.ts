import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../../services/logger.js';
import type { Worker } from '../../models/types.js';

/**
 * Check if a path is within the user's home directory.
 * Uses realpathSync to prevent symlink traversal outside $HOME.
 * Falls back to path.resolve if the path doesn't exist yet.
 */
export function isWithinHomeDir(dirPath: string): boolean {
  const home = os.homedir();
  let resolvedHome: string;
  try {
    resolvedHome = fs.realpathSync(home);
  } catch {
    resolvedHome = path.resolve(home);
  }

  let resolvedPath: string;
  try {
    resolvedPath = fs.realpathSync(dirPath);
  } catch {
    resolvedPath = path.resolve(dirPath);
  }

  // Ensure the resolved path starts with home dir (with trailing separator to avoid prefix attacks)
  return resolvedPath === resolvedHome || resolvedPath.startsWith(resolvedHome + path.sep);
}

/**
 * Validation result for directory paths based on worker type.
 */
export interface DirectoryValidationResult {
  valid: boolean;
  reason?: 'local_restriction' | 'invalid_path';
}

/**
 * Validate directory path based on worker type.
 * Local workers: enforce home directory restriction (security)
 * Remote workers: allow any path (SSH user permissions control access)
 */
export function validateDirectoryForWorker(
  worker: Worker,
  dirPath: string,
): DirectoryValidationResult {
  // For local workers, enforce home directory restriction
  if (worker.type === 'local') {
    if (!isWithinHomeDir(dirPath)) {
      return { valid: false, reason: 'local_restriction' };
    }
  }

  // For remote workers, allow any path
  // Security is enforced by SSH user permissions on the remote server
  return { valid: true };
}

export function createDirectoriesRouter(): Router {
  const router = Router();

  // GET /api/directories?path=&query= — list/autocomplete directories
  router.get('/', (req, res) => {
    const basePath = String(req.query.path || os.homedir());
    const query = String(req.query.query || '');

    // Reject path traversal
    if (basePath.includes('..') || basePath.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    // Enforce $HOME restriction (FR-005)
    if (!isWithinHomeDir(basePath)) {
      logger.warn({ path: basePath }, 'directory browse rejected: outside $HOME');
      res.status(403).json({ error: 'Directory not allowed: path must be within home directory' });
      return;
    }

    // If query is provided, it's the partial name being typed (last segment)
    // basePath is the parent directory to search in
    let searchDir: string;
    let prefix: string;

    if (query) {
      // User is typing a path like "/home/ubuntu/pro" —
      // searchDir = /home/ubuntu, prefix = "pro"
      searchDir = basePath;
      prefix = query.toLowerCase();
    } else {
      searchDir = basePath;
      prefix = '';
    }

    // Resolve the directory
    const resolved = path.resolve(searchDir);

    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        res.json({ path: resolved, entries: [], exists: false });
        return;
      }
    } catch {
      // Directory doesn't exist — return empty with exists: false
      res.json({ path: resolved, entries: [], exists: false });
      return;
    }

    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const directories = entries
        .filter((e) => {
          if (!e.isDirectory()) return false;
          // Skip hidden dirs and common non-project dirs
          if (e.name.startsWith('.') && e.name !== '.config') return false;
          if (e.name === 'node_modules') return false;
          // Apply prefix filter
          if (prefix && !e.name.toLowerCase().startsWith(prefix)) return false;
          return true;
        })
        .map((e) => ({
          name: e.name,
          path: path.join(resolved, e.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 20); // Limit results

      res.json({ path: resolved, entries: directories, exists: true });
    } catch (err) {
      logger.error({ err, resolved }, 'failed to list directories');
      res.status(500).json({ error: 'Unable to list directories' });
    }
  });

  // GET /api/directories/files?path= — list files in a directory (for SSH key picker)
  // No $HOME restriction — SSH keys may be anywhere on the hub server
  router.get('/files', (req, res) => {
    const basePath = String(req.query.path || os.homedir());

    if (basePath.includes('..') || basePath.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const resolved = path.resolve(basePath);

    try {
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        res.json({ path: resolved, entries: [], dirs: [], exists: false });
        return;
      }
    } catch {
      res.json({ path: resolved, entries: [], dirs: [], exists: false });
      return;
    }

    try {
      const rawEntries = fs.readdirSync(resolved, { withFileTypes: true });
      const dirs = rawEntries
        .filter((e) => e.isDirectory() && (!e.name.startsWith('.') || e.name === '.ssh'))
        .map((e) => ({ name: e.name, path: path.join(resolved, e.name), type: 'directory' as const }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 30);
      const files = rawEntries
        .filter((e) => e.isFile())
        .map((e) => ({ name: e.name, path: path.join(resolved, e.name), type: 'file' as const }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 30);
      res.json({ path: resolved, entries: [...dirs, ...files], exists: true });
    } catch (err) {
      logger.error({ err, resolved }, 'failed to list files');
      res.status(500).json({ error: 'Unable to list files' });
    }
  });

  // POST /api/directories — create a new directory
  router.post('/', (req, res) => {
    const { path: dirPath } = req.body;

    if (!dirPath || typeof dirPath !== 'string') {
      res.status(400).json({ error: 'path is required' });
      return;
    }

    if (dirPath.includes('..') || dirPath.includes('\0')) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }

    const resolved = path.resolve(dirPath);

    try {
      if (fs.existsSync(resolved)) {
        res.json({ path: resolved, created: false, exists: true });
        return;
      }
      fs.mkdirSync(resolved, { recursive: true });
      logger.info({ path: resolved }, 'directory created');
      res.status(201).json({ path: resolved, created: true, exists: true });
    } catch (err) {
      logger.error({ err, resolved }, 'failed to create directory');
      res.status(500).json({ error: 'Unable to create directory' });
    }
  });

  return router;
}
