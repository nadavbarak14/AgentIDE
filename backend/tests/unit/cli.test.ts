import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';

const CLI_PATH = path.join(import.meta.dirname, '../../src/cli.ts');

function runCli(args: string): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execSync(`npx tsx ${CLI_PATH} ${args}`, {
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, NODE_ENV: 'test' },
    });
    return { stdout, stderr: '', status: 0 };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      status: e.status || 1,
    };
  }
}

describe('CLI', () => {
  it('shows version with --version', () => {
    const { stdout, status } = runCli('--version');
    expect(status).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('shows help with --help', () => {
    const { stdout, status } = runCli('--help');
    expect(status).toBe(0);
    expect(stdout).toContain('agentide');
    expect(stdout).toContain('start');
  });

  it('shows start command help', () => {
    const { stdout, status } = runCli('start --help');
    expect(status).toBe(0);
    expect(stdout).toContain('--port');
    expect(stdout).toContain('--host');
  });
});
