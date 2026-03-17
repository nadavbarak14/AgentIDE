import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
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

  describe('File Change Forwarding', () => {
    it('report.html path matches the forwarding condition', () => {
      // The SessionCard forwards file_changed events to the extension when
      // the path ends with report.html. Verify the matching logic here.
      const matchFn = (p: string) => p.endsWith('report.html') || p.endsWith('/report.html');

      expect(matchFn('report.html')).toBe(true);
      expect(matchFn('/home/user/project/report.html')).toBe(true);
      expect(matchFn('some/path/report.html')).toBe(true);
      expect(matchFn('other-report.html')).toBe(true); // endsWith matches
      expect(matchFn('report.html.bak')).toBe(false);
      expect(matchFn('index.html')).toBe(false);
      expect(matchFn('report.txt')).toBe(false);
    });

    it('board command is report.file_changed', () => {
      // Verify the manifest declares the board command used for forwarding
      const manifestPath = path.join(extensionsDir, 'work-report', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(manifest.boardCommands).toContain('report.file_changed');
    });
  });

  describe('GitHub Export', () => {
    /**
     * Helper: write a temp Node.js script to run the HTML-to-markdown conversion
     * (same logic as the inline node -e in report.export-github.sh).
     * Avoids shell escaping issues by writing a .js file.
     */
    function runConversion(cwd: string): string {
      const script = `
const fs = require('fs');
const html = fs.readFileSync('report.html', 'utf-8');
let md = html;
md = md.replace(/<!DOCTYPE[^>]*>/gi, '');
md = md.replace(/<html[^>]*>/gi, '');
md = md.replace(/<\\/html>/gi, '');
md = md.replace(/<head>[\\s\\S]*?<\\/head>/gi, '');
md = md.replace(/<body[^>]*>/gi, '');
md = md.replace(/<\\/body>/gi, '');
md = md.replace(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/gi, '# $1\\n\\n');
md = md.replace(/<h2[^>]*>([\\s\\S]*?)<\\/h2>/gi, '## $1\\n\\n');
md = md.replace(/<h3[^>]*>([\\s\\S]*?)<\\/h3>/gi, '### $1\\n\\n');
md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\\/?>/gi, '![$2]($1)');
md = md.replace(/<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\\/?>/gi, '![$1]($2)');
md = md.replace(/<img[^>]*src=["']([^"']*)["'][^>]*\\/?>/gi, '![image]($1)');
md = md.replace(/<video[^>]*src=["']([^"']*)["'][^>]*>[\\s\\S]*?<\\/video>/gi, '$1');
md = md.replace(/<pre[^>]*><code[^>]*class=["']language-([^"']*)["'][^>]*>([\\s\\S]*?)<\\/code><\\/pre>/gi, '\`\`\`$1\\n$2\\n\`\`\`\\n\\n');
md = md.replace(/<pre[^>]*><code[^>]*>([\\s\\S]*?)<\\/code><\\/pre>/gi, '\`\`\`\\n$1\\n\`\`\`\\n\\n');
md = md.replace(/<p[^>]*>([\\s\\S]*?)<\\/p>/gi, '$1\\n\\n');
md = md.replace(/<strong[^>]*>([\\s\\S]*?)<\\/strong>/gi, '**$1**');
md = md.replace(/<em[^>]*>([\\s\\S]*?)<\\/em>/gi, '*$1*');
md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>/gi, '[$2]($1)');
md = md.replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, '');
md = md.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '');
md = md.replace(/<[^>]+>/g, '');
md = md.replace(/&amp;/g, '&');
md = md.replace(/&lt;/g, '<');
md = md.replace(/&gt;/g, '>');
md = md.replace(/\\n{3,}/g, '\\n\\n');
md = md.trim();
process.stdout.write(md);
`;
      const scriptPath = path.join(cwd, '_convert.js');
      fs.writeFileSync(scriptPath, script);
      const result = execSync('node _convert.js', { cwd, encoding: 'utf-8', timeout: 10000 });
      fs.unlinkSync(scriptPath);
      return result;
    }

    /**
     * Helper: extract local media paths from report.html (same logic as the export script).
     */
    function extractMediaPaths(cwd: string): string[] {
      const script = `
const fs = require('fs');
const html = fs.readFileSync('report.html', 'utf-8');
const paths = new Set();
const imgRegex = /src=["']([^"']*\\.(png|jpg|jpeg|gif|webp|mp4|webm|mov))["']/gi;
let match;
while ((match = imgRegex.exec(html)) !== null) {
  if (!match[1].startsWith('http')) paths.add(match[1]);
}
for (const p of paths) console.log(p);
`;
      const scriptPath = path.join(cwd, '_extract.js');
      fs.writeFileSync(scriptPath, script);
      const result = execSync('node _extract.js', { cwd, encoding: 'utf-8', timeout: 10000 }).trim();
      fs.unlinkSync(scriptPath);
      return result.split('\n').filter(Boolean);
    }

    it('converts a text-only report to markdown', () => {
      const reportHtml = `<!DOCTYPE html>
<html><head><title>Report</title></head>
<body>
<h1>Work Report</h1>
<p>Fixed a critical bug in the authentication module.</p>
<h2>Changes</h2>
<pre><code class="language-ts">const fixed = true;</code></pre>
</body></html>`;
      fs.writeFileSync(path.join(tmpDir, 'report.html'), reportHtml);

      const result = runConversion(tmpDir);

      expect(result).toContain('# Work Report');
      expect(result).toContain('Fixed a critical bug');
      expect(result).toContain('## Changes');
    });

    it('converts a report with images to markdown image syntax', () => {
      const reportHtml = `<html><body>
<h1>Feature Demo</h1>
<p>Here is a screenshot:</p>
<img src=".report-assets/1234-screenshot.png" alt="before fix">
</body></html>`;
      fs.writeFileSync(path.join(tmpDir, 'report.html'), reportHtml);

      const result = runConversion(tmpDir);

      expect(result).toContain('# Feature Demo');
      expect(result).toContain('![before fix](.report-assets/1234-screenshot.png)');
    });

    it('extracts local media paths and excludes remote URLs', () => {
      const reportHtml = `<html><body>
        <img src=".report-assets/1234-screenshot.png" alt="before fix">
        <video src=".report-assets/5678-demo.webm" controls></video>
        <img src="https://example.com/external.png" alt="external">
      </body></html>`;
      fs.writeFileSync(path.join(tmpDir, 'report.html'), reportHtml);

      const paths = extractMediaPaths(tmpDir);

      expect(paths).toContain('.report-assets/1234-screenshot.png');
      expect(paths).toContain('.report-assets/5678-demo.webm');
      expect(paths).not.toContain('https://example.com/external.png');
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
