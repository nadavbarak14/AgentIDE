import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

const EXTENSIONS_DIR = path.resolve(__dirname, '../../..', 'extensions', 'work-report', 'skills');

describe('Work Report Skills', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-report-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runSkill(skillName: string, args: string[], cwd?: string): { stdout: string; stderr: string; exitCode: number } {
    const scriptPath = path.join(EXTENSIONS_DIR, skillName, 'scripts', `${skillName}.sh`);
    try {
      const stdout = execSync(`bash "${scriptPath}" ${args.map(a => `"${a}"`).join(' ')}`, {
        cwd: cwd || tmpDir,
        encoding: 'utf-8',
        timeout: 10000,
        env: { ...process.env, PATH: process.env.PATH },
      });
      return { stdout: stdout.trim(), stderr: '', exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      return {
        stdout: (e.stdout || '').trim(),
        stderr: (e.stderr || '').trim(),
        exitCode: e.status || 1,
      };
    }
  }

  describe('report.attach-screenshot', () => {
    it('copies an image file to .report-assets/ with timestamp prefix', () => {
      const srcFile = path.join(tmpDir, 'test.png');
      fs.writeFileSync(srcFile, 'fake-png-data');

      const result = runSkill('report.attach-screenshot', [srcFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^\.report-assets\/\d+-test\.png$/);

      const destPath = path.join(tmpDir, result.stdout);
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('fake-png-data');
    });

    it('supports jpg, jpeg, gif, webp formats', () => {
      for (const ext of ['jpg', 'jpeg', 'gif', 'webp']) {
        const srcFile = path.join(tmpDir, `test.${ext}`);
        fs.writeFileSync(srcFile, 'data');

        const result = runSkill('report.attach-screenshot', [srcFile]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`.${ext}`);

        // Clean up for next iteration
        fs.rmSync(path.join(tmpDir, '.report-assets'), { recursive: true, force: true });
      }
    });

    it('rejects non-image files', () => {
      const srcFile = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(srcFile, 'text');

      const result = runSkill('report.attach-screenshot', [srcFile]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unsupported image format');
    });

    it('fails when source file does not exist', () => {
      const result = runSkill('report.attach-screenshot', ['/nonexistent/file.png']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('File not found');
    });

    it('creates .report-assets/ directory if it does not exist', () => {
      const srcFile = path.join(tmpDir, 'test.png');
      fs.writeFileSync(srcFile, 'data');

      expect(fs.existsSync(path.join(tmpDir, '.report-assets'))).toBe(false);

      runSkill('report.attach-screenshot', [srcFile]);

      expect(fs.existsSync(path.join(tmpDir, '.report-assets'))).toBe(true);
    });
  });

  describe('report.attach-video', () => {
    it('copies a video file to .report-assets/ with timestamp prefix', () => {
      const srcFile = path.join(tmpDir, 'recording.webm');
      fs.writeFileSync(srcFile, 'fake-webm-data');

      const result = runSkill('report.attach-video', [srcFile]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toMatch(/^\.report-assets\/\d+-recording\.webm$/);

      const destPath = path.join(tmpDir, result.stdout);
      expect(fs.existsSync(destPath)).toBe(true);
      expect(fs.readFileSync(destPath, 'utf-8')).toBe('fake-webm-data');
    });

    it('supports mp4 and mov formats', () => {
      for (const ext of ['mp4', 'mov']) {
        const srcFile = path.join(tmpDir, `video.${ext}`);
        fs.writeFileSync(srcFile, 'data');

        const result = runSkill('report.attach-video', [srcFile]);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`.${ext}`);

        fs.rmSync(path.join(tmpDir, '.report-assets'), { recursive: true, force: true });
      }
    });

    it('rejects non-video files', () => {
      const srcFile = path.join(tmpDir, 'test.pdf');
      fs.writeFileSync(srcFile, 'data');

      const result = runSkill('report.attach-video', [srcFile]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unsupported video format');
    });

    it('fails when source file does not exist', () => {
      const result = runSkill('report.attach-video', ['/nonexistent/file.webm']);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('File not found');
    });
  });

  describe('report.attach-diff', () => {
    it('outputs git diff to stdout', () => {
      // Create a temp git repo with changes
      execSync('git init && git config user.email "test@test.com" && git config user.name "Test"', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'original');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'modified');

      const result = runSkill('report.attach-diff', [], tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('diff --git');
      expect(result.stdout).toContain('-original');
      expect(result.stdout).toContain('+modified');
    });

    it('fails in non-git directory', () => {
      const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-git-'));
      try {
        const result = runSkill('report.attach-diff', [], nonGitDir);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Not a git repository');
      } finally {
        fs.rmSync(nonGitDir, { recursive: true, force: true });
      }
    });

    it('supports custom git diff arguments', () => {
      execSync('git init && git config user.email "test@test.com" && git config user.name "Test"', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'aaa');
      fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'bbb');
      execSync('git add . && git commit -m "init"', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'a.txt'), 'modified-a');
      fs.writeFileSync(path.join(tmpDir, 'b.txt'), 'modified-b');

      // Only diff a specific file
      const result = runSkill('report.attach-diff', ['--', 'a.txt'], tmpDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('a.txt');
      expect(result.stdout).not.toContain('b.txt');
    });
  });
});
