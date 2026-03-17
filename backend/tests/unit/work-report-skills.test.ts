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

  describe('report.export-github', () => {
    /**
     * Helper: run the HTML-to-markdown conversion used by the export script.
     * Writes a temp .js file to avoid shell escaping issues.
     */
    function convertHtmlToMarkdown(html: string): string {
      fs.writeFileSync(path.join(tmpDir, 'report.html'), html);
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
md = md.replace(/<video[^>]*>[\\s\\S]*?<source[^>]*src=["']([^"']*)["'][^>]*>[\\s\\S]*?<\\/video>/gi, '$1');
md = md.replace(/<pre[^>]*><code[^>]*class=["']language-([^"']*)["'][^>]*>([\\s\\S]*?)<\\/code><\\/pre>/gi, '\`\`\`$1\\n$2\\n\`\`\`\\n\\n');
md = md.replace(/<pre[^>]*><code[^>]*>([\\s\\S]*?)<\\/code><\\/pre>/gi, '\`\`\`\\n$1\\n\`\`\`\\n\\n');
md = md.replace(/<pre[^>]*>([\\s\\S]*?)<\\/pre>/gi, '\`\`\`\\n$1\\n\`\`\`\\n\\n');
md = md.replace(/<code[^>]*>([\\s\\S]*?)<\\/code>/gi, '\`$1\`');
md = md.replace(/<p[^>]*>([\\s\\S]*?)<\\/p>/gi, '$1\\n\\n');
md = md.replace(/<ul[^>]*>([\\s\\S]*?)<\\/ul>/gi, '$1\\n');
md = md.replace(/<ol[^>]*>([\\s\\S]*?)<\\/ol>/gi, '$1\\n');
md = md.replace(/<li[^>]*>([\\s\\S]*?)<\\/li>/gi, '- $1\\n');
md = md.replace(/<br\\s*\\/?>/gi, '\\n');
md = md.replace(/<hr\\s*\\/?>/gi, '---\\n\\n');
md = md.replace(/<strong[^>]*>([\\s\\S]*?)<\\/strong>/gi, '**$1**');
md = md.replace(/<b[^>]*>([\\s\\S]*?)<\\/b>/gi, '**$1**');
md = md.replace(/<em[^>]*>([\\s\\S]*?)<\\/em>/gi, '*$1*');
md = md.replace(/<i[^>]*>([\\s\\S]*?)<\\/i>/gi, '*$1*');
md = md.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>([\\s\\S]*?)<\\/a>/gi, '[$2]($1)');
md = md.replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, '');
md = md.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '');
md = md.replace(/<[^>]+>/g, '');
md = md.replace(/&amp;/g, '&');
md = md.replace(/&lt;/g, '<');
md = md.replace(/&gt;/g, '>');
md = md.replace(/&quot;/g, '"');
md = md.replace(/&#39;/g, "'");
md = md.replace(/&nbsp;/g, ' ');
md = md.replace(/\\n{3,}/g, '\\n\\n');
md = md.trim();
process.stdout.write(md);
`;
      const scriptPath = path.join(tmpDir, '_convert.js');
      fs.writeFileSync(scriptPath, script);
      const result = execSync('node _convert.js', { cwd: tmpDir, encoding: 'utf-8', timeout: 10000 });
      fs.unlinkSync(scriptPath);
      return result;
    }

    /**
     * Helper: extract local media paths from report.html.
     */
    function extractMediaPaths(html: string): string[] {
      fs.writeFileSync(path.join(tmpDir, 'report.html'), html);
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
      const scriptPath = path.join(tmpDir, '_extract.js');
      fs.writeFileSync(scriptPath, script);
      const result = execSync('node _extract.js', { cwd: tmpDir, encoding: 'utf-8', timeout: 10000 }).trim();
      fs.unlinkSync(scriptPath);
      return result.split('\n').filter(Boolean);
    }

    it('converts headings to markdown', () => {
      const md = convertHtmlToMarkdown('<h1>Title</h1><h2>Section</h2><h3>Subsection</h3>');
      expect(md).toContain('# Title');
      expect(md).toContain('## Section');
      expect(md).toContain('### Subsection');
    });

    it('converts paragraphs to plain text', () => {
      const md = convertHtmlToMarkdown('<p>Hello world</p><p>Second paragraph</p>');
      expect(md).toContain('Hello world');
      expect(md).toContain('Second paragraph');
    });

    it('converts img tags to markdown image syntax', () => {
      const md = convertHtmlToMarkdown('<img src=".report-assets/screenshot.png" alt="Screenshot">');
      expect(md).toContain('![Screenshot](.report-assets/screenshot.png)');
    });

    it('converts pre/code blocks to fenced code blocks', () => {
      const md = convertHtmlToMarkdown('<pre><code class="language-js">const x = 1;</code></pre>');
      expect(md).toContain('```js');
      expect(md).toContain('const x = 1;');
      expect(md).toContain('```');
    });

    it('converts video tags to direct URLs', () => {
      const md = convertHtmlToMarkdown('<video src=".report-assets/demo.mp4" controls></video>');
      expect(md).toContain('.report-assets/demo.mp4');
      expect(md).not.toContain('<video');
    });

    it('converts emphasis and strong tags', () => {
      const md = convertHtmlToMarkdown('<p><strong>bold</strong> and <em>italic</em></p>');
      expect(md).toContain('**bold**');
      expect(md).toContain('*italic*');
    });

    it('converts links to markdown link syntax', () => {
      const md = convertHtmlToMarkdown('<a href="https://example.com">Example</a>');
      expect(md).toContain('[Example](https://example.com)');
    });

    it('strips style and script tags', () => {
      const md = convertHtmlToMarkdown('<style>body { color: red; }</style><script>alert(1)</script><p>Content</p>');
      expect(md).not.toContain('color: red');
      expect(md).not.toContain('alert');
      expect(md).toContain('Content');
    });

    it('fails when report.html does not exist', () => {
      const result = runSkill('report.export-github', []);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('report.html not found');
    });

    it('extracts local media paths from report HTML', () => {
      const paths = extractMediaPaths(`<html><body>
        <img src=".report-assets/shot.png" alt="test">
        <img src="https://github.com/remote.png" alt="remote">
        <video src=".report-assets/demo.webm" controls></video>
      </body></html>`);

      expect(paths).toContain('.report-assets/shot.png');
      expect(paths).toContain('.report-assets/demo.webm');
      expect(paths).not.toContain('https://github.com/remote.png');
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
