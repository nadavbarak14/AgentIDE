import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We'll test the actual module after implementation
// For now, define the expected interface
import { checkPrerequisites, detectWSLVersion } from '../../src/services/prerequisites.js';

describe('prerequisites checker', () => {
  describe('checkPrerequisites', () => {
    it('returns results for all checked tools', () => {
      const results = checkPrerequisites();
      const toolNames = results.map((r) => r.tool);
      expect(toolNames).toContain('grep');
      expect(toolNames).toContain('lsof');
      expect(toolNames).toContain('curl');
      expect(toolNames).toContain('python3');
      expect(results.length).toBe(4);
    });

    it('returns { tool, available } objects', () => {
      const results = checkPrerequisites();
      for (const result of results) {
        expect(result).toHaveProperty('tool');
        expect(result).toHaveProperty('available');
        expect(typeof result.tool).toBe('string');
        expect(typeof result.available).toBe('boolean');
      }
    });

    it('detects grep as available (real subprocess call)', () => {
      // grep is standard on all Linux/macOS CI environments
      const results = checkPrerequisites();
      const grepResult = results.find((r) => r.tool === 'grep');
      expect(grepResult).toBeDefined();
      expect(grepResult!.available).toBe(true);
    });

    it('uses which to check tool availability', () => {
      // Verify that 'which grep' actually works as expected
      const stdout = execFileSync('which', ['grep'], { encoding: 'utf-8' });
      expect(stdout.trim()).toMatch(/grep$/);
    });

    it('handles missing tools gracefully without throwing', () => {
      // The function should never throw, even if tools are missing
      expect(() => checkPrerequisites()).not.toThrow();
    });
  });

  describe('detectWSLVersion', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsl-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns "none" on native Linux (no microsoft in /proc/version)', () => {
      const fakeProcVersion = path.join(tmpDir, 'version');
      fs.writeFileSync(fakeProcVersion, 'Linux version 6.8.0-1041-oracle (buildd@lcy02-amd64-116) (x86_64-linux-gnu-gcc-13)');
      const result = detectWSLVersion(fakeProcVersion);
      expect(result).toBe('none');
    });

    it('returns "wsl2" when /proc/version contains microsoft and WSL2', () => {
      const fakeProcVersion = path.join(tmpDir, 'version');
      fs.writeFileSync(fakeProcVersion, 'Linux version 5.15.146.1-microsoft-standard-WSL2 (root@1234) (gcc)');
      const result = detectWSLVersion(fakeProcVersion);
      expect(result).toBe('wsl2');
    });

    it('returns "wsl1" when /proc/version contains Microsoft without WSL2', () => {
      const fakeProcVersion = path.join(tmpDir, 'version');
      // WSL1 /proc/version typically contains "Microsoft" (capital M) but not "WSL2"
      fs.writeFileSync(fakeProcVersion, 'Linux version 4.4.0-19041-Microsoft (Microsoft@Microsoft.com) (gcc version 5.4.0)');
      const result = detectWSLVersion(fakeProcVersion);
      expect(result).toBe('wsl1');
    });

    it('returns "none" when /proc/version does not exist', () => {
      const result = detectWSLVersion('/nonexistent/proc/version');
      expect(result).toBe('none');
    });

    it('detects microsoft case-insensitively', () => {
      const fakeProcVersion = path.join(tmpDir, 'version');
      fs.writeFileSync(fakeProcVersion, 'Linux version 5.15.0-MICROSOFT-standard-WSL2');
      const result = detectWSLVersion(fakeProcVersion);
      expect(result).toBe('wsl2');
    });
  });
});
