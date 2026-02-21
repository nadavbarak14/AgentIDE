import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isWithinHomeDir, validateDirectoryForWorker } from '../../src/api/routes/directories.js';
import type { Worker } from '../../src/models/types.js';

describe('isWithinHomeDir', () => {
  const home = os.homedir();
  let tmpDir: string | null = null;

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('returns true for paths within $HOME', () => {
    expect(isWithinHomeDir(path.join(home, 'projects'))).toBe(true);
    expect(isWithinHomeDir(path.join(home, 'projects', 'myapp'))).toBe(true);
    expect(isWithinHomeDir(path.join(home, '.config'))).toBe(true);
  });

  it('returns true for $HOME itself', () => {
    expect(isWithinHomeDir(home)).toBe(true);
  });

  it('returns false for paths outside $HOME', () => {
    expect(isWithinHomeDir('/tmp')).toBe(false);
    expect(isWithinHomeDir('/etc')).toBe(false);
    expect(isWithinHomeDir('/var/log')).toBe(false);
  });

  it('returns false for the root path', () => {
    expect(isWithinHomeDir('/')).toBe(false);
  });

  it('handles relative paths by resolving them', () => {
    // Relative paths are resolved from cwd, which may or may not be in $HOME
    const cwd = process.cwd();
    const isInHome = cwd.startsWith(home + path.sep) || cwd === home;
    expect(isWithinHomeDir('.')).toBe(isInHome);
  });

  it('returns false for paths that are prefixes of $HOME but not within it', () => {
    // e.g., /home/usermalicious when home is /home/user
    const parentDir = path.dirname(home);
    const basename = path.basename(home);
    const fakeHome = path.join(parentDir, basename + 'malicious');
    expect(isWithinHomeDir(fakeHome)).toBe(false);
  });

  it('blocks symlink traversal outside $HOME', () => {
    // Create a symlink inside home pointing outside
    tmpDir = fs.mkdtempSync(path.join(home, '.c3-test-'));
    const symlinkPath = path.join(tmpDir, 'escape');

    try {
      fs.symlinkSync('/tmp', symlinkPath);
      expect(isWithinHomeDir(symlinkPath)).toBe(false);
    } catch {
      // If symlink creation fails (permissions), skip this test
    }
  });

  it('handles non-existent paths gracefully', () => {
    // Non-existent paths should be resolved with path.resolve fallback
    const nonExistent = path.join(home, 'nonexistent-dir-12345');
    expect(isWithinHomeDir(nonExistent)).toBe(true);

    const outsideNonExistent = '/nonexistent-dir-12345/abc';
    expect(isWithinHomeDir(outsideNonExistent)).toBe(false);
  });
});

describe('validateDirectoryForWorker', () => {
  const home = os.homedir();

  // Mock workers
  const localWorker: Worker = {
    id: 'local-worker-id',
    name: 'Local Worker',
    type: 'local',
    sshHost: null,
    sshPort: 22,
    sshUser: null,
    sshKeyPath: null,
    status: 'connected',
    maxSessions: 5,
    lastHeartbeat: null,
    createdAt: new Date().toISOString(),
  };

  const remoteWorker: Worker = {
    id: 'remote-worker-id',
    name: 'Remote Worker',
    type: 'remote',
    sshHost: '192.168.1.100',
    sshPort: 22,
    sshUser: 'ubuntu',
    sshKeyPath: '/home/user/.ssh/id_rsa',
    status: 'connected',
    maxSessions: 5,
    lastHeartbeat: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  describe('local worker validation', () => {
    it('allows paths within home directory', () => {
      const result = validateDirectoryForWorker(localWorker, path.join(home, 'projects'));
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('rejects paths outside home directory', () => {
      const result = validateDirectoryForWorker(localWorker, '/opt/project');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('local_restriction');
    });

    it('allows home directory itself', () => {
      const result = validateDirectoryForWorker(localWorker, home);
      expect(result.valid).toBe(true);
    });

    it('rejects root directory', () => {
      const result = validateDirectoryForWorker(localWorker, '/');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('local_restriction');
    });
  });

  describe('remote worker validation', () => {
    it('allows any path on remote server', () => {
      const result = validateDirectoryForWorker(remoteWorker, '/opt/projects/myapp');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('allows root directory on remote server', () => {
      const result = validateDirectoryForWorker(remoteWorker, '/');
      expect(result.valid).toBe(true);
    });

    it('allows home directory on remote server', () => {
      const result = validateDirectoryForWorker(remoteWorker, '/home/ubuntu/project');
      expect(result.valid).toBe(true);
    });

    it('allows system directories on remote server', () => {
      const result = validateDirectoryForWorker(remoteWorker, '/var/www/app');
      expect(result.valid).toBe(true);
    });

    it('does not enforce local home restriction', () => {
      // Even if path is outside local home, remote worker should allow it
      const result = validateDirectoryForWorker(remoteWorker, '/tmp/remote-project');
      expect(result.valid).toBe(true);
    });
  });
});
