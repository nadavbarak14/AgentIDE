import { describe, it, expect } from 'vitest';
import { validateManifest, manifestToLoaded } from '../../src/services/extension-loader';

describe('extension-loader', () => {
  describe('validateManifest', () => {
    it('accepts a valid manifest with panel', () => {
      const manifest = {
        name: 'hello-world',
        displayName: 'Hello World',
        panel: {
          entry: 'ui/index.html',
          defaultPosition: 'right',
          icon: 'puzzle',
        },
      };
      const result = validateManifest(manifest, 'hello-world');
      expect(result).not.toBeNull();
      expect(result!.name).toBe('hello-world');
      expect(result!.displayName).toBe('Hello World');
      expect(result!.panel?.entry).toBe('ui/index.html');
    });

    it('accepts a valid skill-only manifest (no panel)', () => {
      const manifest = {
        name: 'my-tool',
        displayName: 'My Tool',
        skills: ['skills/my-action'],
      };
      const result = validateManifest(manifest, 'my-tool');
      expect(result).not.toBeNull();
      expect(result!.panel).toBeUndefined();
      expect(result!.skills).toEqual(['skills/my-action']);
    });

    it('rejects null/undefined input', () => {
      expect(validateManifest(null, 'test')).toBeNull();
      expect(validateManifest(undefined, 'test')).toBeNull();
    });

    it('rejects manifest with missing name', () => {
      expect(validateManifest({ displayName: 'X' }, 'test')).toBeNull();
    });

    it('rejects manifest with missing displayName', () => {
      expect(validateManifest({ name: 'test' }, 'test')).toBeNull();
    });

    it('rejects name with uppercase letters', () => {
      expect(validateManifest({ name: 'MyExt', displayName: 'X' }, 'MyExt')).toBeNull();
    });

    it('rejects name with spaces', () => {
      expect(validateManifest({ name: 'my ext', displayName: 'X' }, 'my ext')).toBeNull();
    });

    it('rejects name that does not match folder name', () => {
      const manifest = { name: 'foo', displayName: 'Foo' };
      expect(validateManifest(manifest, 'bar')).toBeNull();
    });

    it('rejects panel missing entry', () => {
      const manifest = {
        name: 'test',
        displayName: 'Test',
        panel: { defaultPosition: 'right', icon: 'x' },
      };
      expect(validateManifest(manifest, 'test')).toBeNull();
    });

    it('rejects panel with invalid defaultPosition', () => {
      const manifest = {
        name: 'test',
        displayName: 'Test',
        panel: { entry: 'ui/index.html', defaultPosition: 'center', icon: 'x' },
      };
      expect(validateManifest(manifest, 'test')).toBeNull();
    });

    it('rejects skills that are not an array', () => {
      const manifest = { name: 'test', displayName: 'Test', skills: 'bad' };
      expect(validateManifest(manifest, 'test')).toBeNull();
    });

    it('rejects skills with non-string entries', () => {
      const manifest = { name: 'test', displayName: 'Test', skills: [123] };
      expect(validateManifest(manifest, 'test')).toBeNull();
    });

    it('rejects boardCommands with empty strings', () => {
      const manifest = { name: 'test', displayName: 'Test', boardCommands: [''] };
      expect(validateManifest(manifest, 'test')).toBeNull();
    });

    it('accepts manifest with boardCommands', () => {
      const manifest = {
        name: 'test',
        displayName: 'Test',
        boardCommands: ['cmd.one', 'cmd.two'],
      };
      const result = validateManifest(manifest, 'test');
      expect(result).not.toBeNull();
      expect(result!.boardCommands).toEqual(['cmd.one', 'cmd.two']);
    });
  });

  describe('manifestToLoaded', () => {
    it('converts manifest with panel to LoadedExtension', () => {
      const manifest = {
        name: 'hello-world',
        displayName: 'Hello World',
        panel: {
          entry: 'ui/index.html',
          defaultPosition: 'right' as const,
          icon: 'puzzle',
        },
        boardCommands: ['hello.cmd'],
      };
      const loaded = manifestToLoaded(manifest);
      expect(loaded.name).toBe('hello-world');
      expect(loaded.panelUrl).toBe('/extensions/hello-world/ui/index.html');
      expect(loaded.panelConfig).toEqual({ defaultPosition: 'right', icon: 'puzzle' });
      expect(loaded.panelKey).toBe('ext:hello-world');
      expect(loaded.boardCommands).toEqual(['hello.cmd']);
    });

    it('converts skill-only manifest (no panel)', () => {
      const manifest = {
        name: 'tools',
        displayName: 'Tools',
      };
      const loaded = manifestToLoaded(manifest);
      expect(loaded.panelUrl).toBeNull();
      expect(loaded.panelConfig).toBeNull();
      expect(loaded.boardCommands).toEqual([]);
    });
  });
});
