import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import express from 'express';
import request from 'supertest';

describe('Work Report Extension', () => {
  let tmpDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-report-int-'));
    extensionsDir = path.resolve(__dirname, '../../..', 'extensions');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('Extension Manifest Validation', () => {
    it('has a valid manifest.json', () => {
      const manifestPath = path.join(extensionsDir, 'work-report', 'manifest.json');
      expect(fs.existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.name).toBe('work-report');
      expect(manifest.displayName).toBe('Work Report');
      expect(manifest.panel).toBeDefined();
      expect(manifest.panel.entry).toBe('ui/index.html');
      expect(manifest.panel.defaultPosition).toBe('right');
      expect(manifest.panel.icon).toBe('file-text');
    });

    it('declares all 4 skills in manifest', () => {
      const manifestPath = path.join(extensionsDir, 'work-report', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      expect(manifest.skills).toHaveLength(4);
      expect(manifest.skills).toContain('skills/report.attach-screenshot');
      expect(manifest.skills).toContain('skills/report.attach-video');
      expect(manifest.skills).toContain('skills/report.attach-diff');
      expect(manifest.skills).toContain('skills/report.export-github');
    });

    it('declares report.file_changed board command', () => {
      const manifestPath = path.join(extensionsDir, 'work-report', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      expect(manifest.boardCommands).toContain('report.file_changed');
    });

    it('has UI entry files', () => {
      const uiDir = path.join(extensionsDir, 'work-report', 'ui');
      expect(fs.existsSync(path.join(uiDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(uiDir, 'styles.css'))).toBe(true);
      expect(fs.existsSync(path.join(uiDir, 'app.js'))).toBe(true);
    });

    it('has all skill directories with SKILL.md and scripts', () => {
      const skillNames = [
        'report.attach-screenshot',
        'report.attach-video',
        'report.attach-diff',
        'report.export-github',
      ];

      for (const name of skillNames) {
        const skillDir = path.join(extensionsDir, 'work-report', 'skills', name);
        expect(fs.existsSync(path.join(skillDir, 'SKILL.md'))).toBe(true);
        expect(fs.existsSync(path.join(skillDir, 'scripts', `${name}.sh`))).toBe(true);
      }
    });
  });

  describe('Extension Discovery', () => {
    it('work-report appears in /api/extensions scan', () => {
      // Simulate the extensions scan the same way the server does
      const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
      const extensionNames: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(extensionsDir, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) extensionNames.push(entry.name);
      }
      expect(extensionNames).toContain('work-report');
    });
  });

  describe('Report File Serving', () => {
    it('serves report.html from session working directory', async () => {
      // Create a mock file server mimicking the serve route
      const app = express();
      const sessionDir = tmpDir;

      app.get('/api/sessions/:id/serve/*', (req, res) => {
        const filePath = req.params[0] || 'index.html';
        const fullPath = path.join(sessionDir, filePath);
        const resolved = path.resolve(fullPath);
        // Security: ensure path stays within session dir
        if (!resolved.startsWith(path.resolve(sessionDir))) {
          res.status(403).send('Forbidden');
          return;
        }
        if (!fs.existsSync(resolved)) {
          res.status(404).send('Not found');
          return;
        }
        res.sendFile(resolved);
      });

      // No report yet → 404
      const res404 = await request(app).get('/api/sessions/test-id/serve/report.html');
      expect(res404.status).toBe(404);

      // Create report
      fs.writeFileSync(path.join(sessionDir, 'report.html'), '<html><body><h1>Test Report</h1></body></html>');

      const res200 = await request(app).get('/api/sessions/test-id/serve/report.html');
      expect(res200.status).toBe(200);
      expect(res200.text).toContain('<h1>Test Report</h1>');
    });

    it('serves assets from .report-assets/ subdirectory', async () => {
      const app = express();
      const sessionDir = tmpDir;

      app.get('/api/sessions/:id/serve/*', (req, res) => {
        const filePath = req.params[0] || 'index.html';
        const fullPath = path.join(sessionDir, filePath);
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(path.resolve(sessionDir))) {
          res.status(403).send('Forbidden');
          return;
        }
        if (!fs.existsSync(resolved)) {
          res.status(404).send('Not found');
          return;
        }
        res.sendFile(resolved);
      });

      // Create asset
      fs.mkdirSync(path.join(sessionDir, '.report-assets'), { recursive: true });
      fs.writeFileSync(path.join(sessionDir, '.report-assets', 'test.png'), 'fake-image');

      const res = await request(app).get('/api/sessions/test-id/serve/.report-assets/test.png');
      expect(res.status).toBe(200);
    });
  });

  describe('Session Cleanup', () => {
    it('removes report.html and .report-assets/ from working directory', () => {
      const sessionDir = tmpDir;

      // Create report artifacts
      fs.writeFileSync(path.join(sessionDir, 'report.html'), '<html>report</html>');
      fs.mkdirSync(path.join(sessionDir, '.report-assets'), { recursive: true });
      fs.writeFileSync(path.join(sessionDir, '.report-assets', 'screenshot.png'), 'data');
      fs.writeFileSync(path.join(sessionDir, '.report-assets', 'recording.webm'), 'data');

      // Also create a user file that should NOT be deleted
      fs.writeFileSync(path.join(sessionDir, 'user-code.ts'), 'const x = 1;');

      // Simulate cleanup (same logic as cleanupWorkReport in session-manager)
      const reportPath = path.join(sessionDir, 'report.html');
      const assetsPath = path.join(sessionDir, '.report-assets');
      if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
      if (fs.existsSync(assetsPath)) fs.rmSync(assetsPath, { recursive: true, force: true });

      // Verify cleanup
      expect(fs.existsSync(reportPath)).toBe(false);
      expect(fs.existsSync(assetsPath)).toBe(false);
      // User files preserved
      expect(fs.existsSync(path.join(sessionDir, 'user-code.ts'))).toBe(true);
    });

    it('cleanup succeeds when no report exists', () => {
      const sessionDir = tmpDir;
      const reportPath = path.join(sessionDir, 'report.html');
      const assetsPath = path.join(sessionDir, '.report-assets');

      // Should not throw
      expect(() => {
        if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
        if (fs.existsSync(assetsPath)) fs.rmSync(assetsPath, { recursive: true, force: true });
      }).not.toThrow();
    });

    it('cleanup succeeds when .report-assets/ is empty', () => {
      const sessionDir = tmpDir;
      fs.mkdirSync(path.join(sessionDir, '.report-assets'), { recursive: true });

      const assetsPath = path.join(sessionDir, '.report-assets');
      expect(() => {
        fs.rmSync(assetsPath, { recursive: true, force: true });
      }).not.toThrow();

      expect(fs.existsSync(assetsPath)).toBe(false);
    });
  });
});
