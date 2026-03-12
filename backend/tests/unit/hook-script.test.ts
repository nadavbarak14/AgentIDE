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

  it('extracts notification_type field from stdin JSON', () => {
    expect(content).toMatch(/notification_type/);
    expect(content).toMatch(/python3.*notification_type/s);
  });

  it('extracts message field from stdin JSON', () => {
    expect(content).toMatch(/\.get\(['"]message['"]/);
    expect(content).toMatch(/python3.*\.get\(['"]message['"]/s);
  });

  it('includes notificationType in curl POST payload', () => {
    expect(content).toMatch(/curl.*notificationType/s);
  });

  it('includes message in curl POST payload', () => {
    expect(content).toMatch(/curl.*\\?"message\\?"/s);
  });

  it('remains backward-compatible with Stop and SessionEnd events', () => {
    expect(content).toContain('Stop');
    expect(content).toContain('SessionEnd');
  });
});
