import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  checkDependency,
  checkAllDependencies,
  formatDependencyReport,
  type SystemDependency,
} from '../../src/utils/dependency-checker.js';

describe('dependency-checker', () => {
  describe('detectPlatform', () => {
    it('returns a valid platform string', () => {
      const platform = detectPlatform();
      expect(['ubuntu', 'rhel', 'macos', 'windows', 'unknown']).toContain(platform);
    });
  });

  describe('checkDependency', () => {
    it('detects node as installed with a version', () => {
      const dep: SystemDependency = {
        name: 'Node.js',
        binary: 'node',
        versionFlag: '--version',
        required: true,
        installInstructions: {},
      };
      const result = checkDependency(dep);
      expect(result.installed).toBe(true);
      expect(result.version).toBeTruthy();
      expect(result.version).toMatch(/^\d+\.\d+/);
    });

    it('reports missing binary as not installed', () => {
      const dep: SystemDependency = {
        name: 'FakeTool',
        binary: 'nonexistent-binary-xyz-12345',
        versionFlag: '--version',
        required: true,
        installInstructions: {},
      };
      const result = checkDependency(dep);
      expect(result.installed).toBe(false);
      expect(result.version).toBeNull();
    });
  });

  describe('checkAllDependencies', () => {
    it('returns results for all required dependencies', () => {
      const results = checkAllDependencies();
      expect(results.length).toBeGreaterThanOrEqual(3);
      const names = results.map((r) => r.dependency.name);
      expect(names).toContain('tmux');
      expect(names).toContain('GitHub CLI');
      expect(names).toContain('Node.js');
    });

    it('always reports node as installed', () => {
      const results = checkAllDependencies();
      const nodeResult = results.find((r) => r.dependency.name === 'Node.js');
      expect(nodeResult?.installed).toBe(true);
    });
  });

  describe('formatDependencyReport', () => {
    it('includes dependency names in output', () => {
      const results = checkAllDependencies();
      const report = formatDependencyReport(results);
      expect(report).toContain('Node.js');
      expect(report).toContain('tmux');
      expect(report).toContain('GitHub CLI');
      expect(report).toContain('Adyx Dependency Check');
    });

    it('shows MISSING for absent dependencies', () => {
      const fakeDep: SystemDependency = {
        name: 'FakeTool',
        binary: 'nonexistent-xyz',
        versionFlag: '--version',
        required: true,
        installInstructions: { ubuntu: 'sudo apt install faketool' },
      };
      const results = [checkDependency(fakeDep)];
      const report = formatDependencyReport(results);
      expect(report).toContain('MISSING');
      expect(report).toContain('Missing dependencies');
    });

    it('shows "All dependencies satisfied" when all present', () => {
      const nodeDep: SystemDependency = {
        name: 'Node.js',
        binary: 'node',
        versionFlag: '--version',
        required: true,
        installInstructions: {},
      };
      const results = [checkDependency(nodeDep)];
      const report = formatDependencyReport(results);
      expect(report).toContain('All dependencies satisfied');
    });
  });
});
