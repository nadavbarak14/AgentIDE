import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const HOOK_PATH = path.resolve(import.meta.dirname, '../../hooks/c3-hook.sh');

describe('c3-hook.sh', () => {
  const content = fs.readFileSync(HOOK_PATH, 'utf-8');

  it('is executable (has shebang line)', () => {
    expect(content.startsWith('#!/')).toBe(true);
  });

  it('contains command -v dependency checks', () => {
    expect(content).toContain('command -v');
  });

  it('checks for python3 dependency', () => {
    // Hook uses `for cmd in python3 curl; do ... command -v "$cmd"` pattern
    expect(content).toMatch(/for\s+cmd\s+in\s+[^;]*python3/);
  });

  it('checks for curl dependency', () => {
    expect(content).toMatch(/for\s+cmd\s+in\s+[^;]*curl/);
  });
});
