import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const POSTINSTALL_SCRIPT = path.join(import.meta.dirname, '../../scripts/postinstall.cjs');

describe('System: postinstall script', { timeout: 15000 }, () => {
  it('exits 0 and prints dependency status', () => {
    const output = execSync(`node ${POSTINSTALL_SCRIPT}`, {
      encoding: 'utf-8',
      timeout: 10000,
    });

    expect(output).toContain('Adyx Dependency Check');
    expect(output).toContain('tmux');
    expect(output).toContain('GitHub CLI');
  });

  it('never exits non-zero even with missing deps', () => {
    // The postinstall script always exits 0 — verify no throw
    const result = execSync(`node ${POSTINSTALL_SCRIPT}`, {
      encoding: 'utf-8',
      timeout: 10000,
    });
    // If we get here, exit code was 0
    expect(result).toBeTruthy();
  });
});
