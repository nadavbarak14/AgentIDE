import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Extensions API', () => {
  let app: express.Express;
  let tmpDir: string;
  let extensionsDir: string;
  let skillsDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ext-test-'));
    extensionsDir = path.join(tmpDir, 'extensions');
    skillsDir = path.join(tmpDir, '.claude-skills', 'skills');
    fs.mkdirSync(extensionsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    app = express();
    app.use(express.json());

    // GET /api/extensions — scans extensionsDir
    app.get('/api/extensions', (_req, res) => {
      if (!fs.existsSync(extensionsDir)) {
        res.json({ extensions: [] });
        return;
      }
      const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
      const names: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(extensionsDir, entry.name, 'manifest.json');
        if (fs.existsSync(manifestPath)) names.push(entry.name);
      }
      res.json({ extensions: names.sort() });
    });

    // POST /api/extensions/toggle-skills
    app.post('/api/extensions/toggle-skills', (req, res) => {
      const { enabled } = req.body as { enabled?: string[] };
      if (!Array.isArray(enabled)) {
        res.status(400).json({ error: 'enabled must be an array of extension names' });
        return;
      }
      const allExtensions: string[] = [];
      if (fs.existsSync(extensionsDir)) {
        for (const entry of fs.readdirSync(extensionsDir, { withFileTypes: true })) {
          if (entry.isDirectory() && fs.existsSync(path.join(extensionsDir, entry.name, 'manifest.json'))) {
            allExtensions.push(entry.name);
          }
        }
      }
      let added = 0;
      let removed = 0;
      for (const extName of allExtensions) {
        const isEnabled = enabled.includes(extName);
        const manifestPath = path.join(extensionsDir, extName, 'manifest.json');
        let manifest: { skills?: string[]; panel?: unknown } = {};
        try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')); } catch { continue; }
        const autoSkills = manifest.panel ? [
          `${extName}.open`, `${extName}.comment`, `${extName}.select-text`
        ] : [];
        const customSkills = (manifest.skills || []).map((s: string) => s.split('/').pop()!);
        for (const skillName of [...autoSkills, ...customSkills]) {
          const skillPath = path.join(skillsDir, skillName);
          if (isEnabled) {
            if (!fs.existsSync(skillPath)) {
              for (const s of manifest.skills || []) {
                if (s.split('/').pop() === skillName) {
                  const source = path.join(extensionsDir, extName, s);
                  if (fs.existsSync(source)) {
                    try { fs.symlinkSync(source, skillPath); added++; } catch { /* exists */ }
                  }
                }
              }
            }
          } else {
            if (fs.existsSync(skillPath)) {
              try {
                const stat = fs.lstatSync(skillPath);
                if (stat.isSymbolicLink() || stat.isDirectory()) {
                  if (stat.isSymbolicLink()) fs.unlinkSync(skillPath);
                  else fs.rmSync(skillPath, { recursive: true });
                  removed++;
                }
              } catch { /* ignore */ }
            }
          }
        }
      }
      res.json({ ok: true, added, removed, enabled });
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper to create an extension on disk
  function createExtension(name: string, manifest: Record<string, unknown>) {
    const extDir = path.join(extensionsDir, name);
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest));
  }

  function createSkillDir(name: string) {
    const dir = path.join(skillsDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${name}`);
  }

  function createCustomSkill(extName: string, skillRelPath: string) {
    const fullPath = path.join(extensionsDir, extName, skillRelPath);
    fs.mkdirSync(fullPath, { recursive: true });
    fs.writeFileSync(path.join(fullPath, 'SKILL.md'), '# Skill');
  }

  describe('GET /api/extensions', () => {
    it('returns empty array when no extensions exist', async () => {
      const res = await request(app).get('/api/extensions');
      expect(res.status).toBe(200);
      expect(res.body.extensions).toEqual([]);
    });

    it('discovers extensions with manifest.json', async () => {
      createExtension('alpha', { name: 'alpha', displayName: 'Alpha' });
      createExtension('beta', { name: 'beta', displayName: 'Beta' });

      const res = await request(app).get('/api/extensions');
      expect(res.status).toBe(200);
      expect(res.body.extensions).toEqual(['alpha', 'beta']);
    });

    it('ignores directories without manifest.json', async () => {
      createExtension('valid', { name: 'valid', displayName: 'Valid' });
      fs.mkdirSync(path.join(extensionsDir, 'no-manifest'), { recursive: true });

      const res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual(['valid']);
    });

    it('ignores files (non-directories) in extensions/', async () => {
      createExtension('valid', { name: 'valid', displayName: 'Valid' });
      fs.writeFileSync(path.join(extensionsDir, 'index.json'), '{}');

      const res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual(['valid']);
    });

    it('returns sorted list', async () => {
      createExtension('zebra', { name: 'zebra', displayName: 'Z' });
      createExtension('alpha', { name: 'alpha', displayName: 'A' });

      const res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual(['alpha', 'zebra']);
    });

    it('reflects newly added extensions without restart', async () => {
      let res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual([]);

      createExtension('new-ext', { name: 'new-ext', displayName: 'New' });

      res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual(['new-ext']);
    });

    it('reflects removed extensions without restart', async () => {
      createExtension('temp', { name: 'temp', displayName: 'Temp' });
      let res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual(['temp']);

      fs.rmSync(path.join(extensionsDir, 'temp'), { recursive: true });

      res = await request(app).get('/api/extensions');
      expect(res.body.extensions).toEqual([]);
    });
  });

  describe('POST /api/extensions/toggle-skills', () => {
    it('rejects non-array enabled parameter', async () => {
      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: 'not-array' });
      expect(res.status).toBe(400);
    });

    it('removes auto-skills for disabled extensions', async () => {
      createExtension('my-ext', {
        name: 'my-ext',
        displayName: 'My Ext',
        panel: { entry: 'ui/index.html', defaultPosition: 'right', icon: 'x' },
      });
      // Pre-create auto-skill directories
      createSkillDir('my-ext.open');
      createSkillDir('my-ext.comment');
      createSkillDir('my-ext.select-text');

      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: [] });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.removed).toBe(3);
      expect(fs.existsSync(path.join(skillsDir, 'my-ext.open'))).toBe(false);
      expect(fs.existsSync(path.join(skillsDir, 'my-ext.comment'))).toBe(false);
      expect(fs.existsSync(path.join(skillsDir, 'my-ext.select-text'))).toBe(false);
    });

    it('does not remove skills for enabled extensions', async () => {
      createExtension('keep', {
        name: 'keep',
        displayName: 'Keep',
        panel: { entry: 'ui/index.html', defaultPosition: 'right', icon: 'x' },
      });
      createSkillDir('keep.open');

      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: ['keep'] });

      expect(res.body.removed).toBe(0);
      expect(fs.existsSync(path.join(skillsDir, 'keep.open'))).toBe(true);
    });

    it('removes custom skill symlinks for disabled extensions', async () => {
      createExtension('with-custom', {
        name: 'with-custom',
        displayName: 'Custom',
        skills: ['skills/my-action'],
      });
      createCustomSkill('with-custom', 'skills/my-action');
      // Create symlink in skills dir
      fs.symlinkSync(
        path.join(extensionsDir, 'with-custom', 'skills', 'my-action'),
        path.join(skillsDir, 'my-action'),
      );

      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: [] });

      expect(res.body.removed).toBeGreaterThanOrEqual(1);
      expect(fs.existsSync(path.join(skillsDir, 'my-action'))).toBe(false);
    });

    it('creates symlinks for custom skills when enabling', async () => {
      createExtension('link-ext', {
        name: 'link-ext',
        displayName: 'Link',
        skills: ['skills/do-thing'],
      });
      createCustomSkill('link-ext', 'skills/do-thing');

      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: ['link-ext'] });

      expect(res.body.ok).toBe(true);
      expect(res.body.added).toBe(1);
      expect(fs.existsSync(path.join(skillsDir, 'do-thing'))).toBe(true);
    });

    it('handles mixed enable/disable across extensions', async () => {
      createExtension('ext-a', {
        name: 'ext-a', displayName: 'A',
        panel: { entry: 'ui/index.html', defaultPosition: 'right', icon: 'x' },
      });
      createExtension('ext-b', {
        name: 'ext-b', displayName: 'B',
        panel: { entry: 'ui/index.html', defaultPosition: 'right', icon: 'x' },
      });
      createSkillDir('ext-a.open');
      createSkillDir('ext-a.comment');
      createSkillDir('ext-a.select-text');
      createSkillDir('ext-b.open');
      createSkillDir('ext-b.comment');
      createSkillDir('ext-b.select-text');

      // Enable A, disable B
      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: ['ext-a'] });

      expect(res.body.removed).toBe(3); // B's 3 auto-skills
      expect(fs.existsSync(path.join(skillsDir, 'ext-a.open'))).toBe(true);
      expect(fs.existsSync(path.join(skillsDir, 'ext-b.open'))).toBe(false);
    });

    it('no-op for extensions without panel (no auto-skills)', async () => {
      createExtension('skill-only', {
        name: 'skill-only', displayName: 'SO',
      });

      const res = await request(app)
        .post('/api/extensions/toggle-skills')
        .send({ enabled: [] });

      expect(res.body.removed).toBe(0);
    });
  });
});
