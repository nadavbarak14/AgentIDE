import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { logger } from '../services/logger.js';
import type { SearchResult } from '../models/types.js';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/** Map file extensions to language identifiers for syntax highlighting */
const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.json': 'json',
  '.md': 'markdown',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.svg': 'xml',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.fish': 'shell',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.gql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.lua': 'lua',
  '.r': 'r',
  '.dart': 'dart',
  '.env': 'shell',
  '.ini': 'ini',
  '.conf': 'ini',
  '.txt': 'plaintext',
  '.log': 'plaintext',
  '.lock': 'plaintext',
};

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
}

export interface FileContent {
  content: string;
  language: string;
  size: number;
}

/**
 * Validate and resolve a path within a base directory.
 * Rejects path traversal attempts and null bytes.
 */
function resolveSafePath(basePath: string, relativePath: string): string | null {
  if (relativePath.includes('..')) return null;
  if (relativePath.includes('\0')) return null;

  const resolved = path.resolve(basePath, relativePath);

  // Ensure the resolved path is still within the base directory
  if (!resolved.startsWith(path.resolve(basePath))) return null;

  return resolved;
}

/** Detect language from file extension */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (EXTENSION_LANGUAGE_MAP[ext]) return EXTENSION_LANGUAGE_MAP[ext];

  // Handle special filenames without extensions
  const basename = path.basename(filePath).toLowerCase();
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  if (basename === '.gitignore' || basename === '.dockerignore') return 'plaintext';

  return 'plaintext';
}

/**
 * List directory contents with file metadata.
 * @param basePath - The root directory (e.g. session working directory)
 * @param subpath - Optional relative subpath within the base directory
 */
export function listDirectory(basePath: string, subpath?: string): DirectoryEntry[] {
  const targetPath = subpath ? resolveSafePath(basePath, subpath) : path.resolve(basePath);

  if (!targetPath) {
    throw new Error('Invalid path: directory traversal is not allowed');
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(targetPath);
  } catch {
    throw new Error(`Path not found: ${subpath || basePath}`);
  }

  if (!stat.isDirectory()) {
    throw new Error('Path is not a directory');
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(targetPath, { withFileTypes: true });
  } catch (err) {
    logger.error({ err, targetPath }, 'failed to read directory');
    throw new Error('Unable to read directory');
  }

  return entries
    .map((entry): DirectoryEntry | null => {
      try {
        const fullPath = path.join(targetPath, entry.name);
        const entryStat = fs.statSync(fullPath);
        return {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entryStat.size,
        };
      } catch {
        // Skip entries we can't stat (broken symlinks, permission issues)
        return null;
      }
    })
    .filter((entry): entry is DirectoryEntry => entry !== null)
    .sort((a, b) => {
      // Directories first, then alphabetical
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/**
 * Read file contents with language detection and size limit enforcement.
 * @param basePath - The root directory (e.g. session working directory)
 * @param filePath - Relative path to the file within the base directory
 */
export function readFile(basePath: string, filePath: string): FileContent {
  const resolvedPath = resolveSafePath(basePath, filePath);

  if (!resolvedPath) {
    throw new Error('Invalid path: directory traversal is not allowed');
  }

  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    throw new Error(`File not found: ${filePath}`);
  }

  if (!stat.isFile()) {
    throw new Error('Path is not a file');
  }

  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${stat.size} bytes exceeds the 1MB limit`);
  }

  let content: string;
  try {
    content = fs.readFileSync(resolvedPath, 'utf-8');
  } catch (err) {
    logger.error({ err, resolvedPath }, 'failed to read file');
    throw new Error('Unable to read file');
  }

  return {
    content,
    language: detectLanguage(resolvedPath),
    size: stat.size,
  };
}

/**
 * Write content to a file within a base directory.
 * @param basePath - The root directory (e.g. session working directory)
 * @param filePath - Relative path to the file within the base directory
 * @param content - The new file content to write
 */
export function writeFile(basePath: string, filePath: string, content: string): void {
  const resolvedPath = resolveSafePath(basePath, filePath);

  if (!resolvedPath) {
    throw new Error('Invalid path: directory traversal is not allowed');
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(resolvedPath);
  if (!fs.existsSync(parentDir)) {
    throw new Error(`Parent directory not found: ${path.dirname(filePath)}`);
  }

  try {
    fs.writeFileSync(resolvedPath, content, 'utf-8');
    logger.info({ filePath: resolvedPath }, 'file saved');
  } catch (err) {
    logger.error({ err, resolvedPath }, 'failed to write file');
    throw new Error('Unable to write file');
  }
}

const MAX_LINE_LENGTH = 500;

const GREP_EXCLUDE_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__', 'coverage',
];

/**
 * Search for text across files in a directory using grep.
 * @param basePath - The root directory to search in
 * @param query - The search term
 * @param limit - Maximum number of results to return
 * @param offset - Number of results to skip (for pagination)
 */
export function searchFiles(
  basePath: string,
  query: string,
  limit: number = 100,
  offset: number = 0,
): { results: SearchResult[]; totalMatches: number; truncated: boolean } {
  const startTime = Date.now();
  const resolvedBase = path.resolve(basePath);

  if (!fs.existsSync(resolvedBase) || !fs.statSync(resolvedBase).isDirectory()) {
    throw new Error(`Search directory not found: ${basePath}`);
  }

  const args = [
    '-rn',        // recursive, line numbers
    '-I',         // skip binary files
    '--color=never',
    ...GREP_EXCLUDE_DIRS.flatMap((dir) => ['--exclude-dir', dir]),
    '--',         // end of options
    query,
    resolvedBase,
  ];

  let stdout: string;
  try {
    // WSL2: grep is standard on Ubuntu, paths use forward slashes
    stdout = execFileSync('grep', args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 15000, // 15s timeout
    });
  } catch (err: unknown) {
    // grep exits with code 1 when no matches found — that's not an error
    if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 1) {
      logger.info({ query, basePath, resultCount: 0, durationMs: Date.now() - startTime }, 'search completed (no matches)');
      return { results: [], totalMatches: 0, truncated: false };
    }
    logger.error({ err, query, basePath }, 'search failed');
    throw new Error('Search failed');
  }

  const lines = stdout.split('\n').filter((line) => line.length > 0);
  const totalMatches = lines.length;

  const results: SearchResult[] = [];
  const paginated = lines.slice(offset, offset + limit);

  for (const line of paginated) {
    // grep output format: /absolute/path/file.ts:123:line content
    const firstColon = line.indexOf(':');
    if (firstColon === -1) continue;
    const secondColon = line.indexOf(':', firstColon + 1);
    if (secondColon === -1) continue;

    const absFilePath = line.substring(0, firstColon);
    const lineNumber = parseInt(line.substring(firstColon + 1, secondColon), 10);
    if (isNaN(lineNumber)) continue;

    let lineContent = line.substring(secondColon + 1);
    if (lineContent.length > MAX_LINE_LENGTH) {
      lineContent = lineContent.substring(0, MAX_LINE_LENGTH);
    }

    // Make path relative to basePath
    const filePath = path.relative(resolvedBase, absFilePath);

    // Find the match position within the line content
    const matchStart = lineContent.indexOf(query);
    const matchLength = query.length;

    results.push({
      filePath,
      lineNumber,
      lineContent,
      matchStart: matchStart >= 0 ? matchStart : 0,
      matchLength,
    });
  }

  const truncated = totalMatches > offset + limit;

  logger.info(
    { query, basePath, resultCount: results.length, totalMatches, durationMs: Date.now() - startTime },
    'search completed',
  );

  return { results, totalMatches, truncated };
}
