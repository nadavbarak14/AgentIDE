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
    expect(stdout).toContain('activate');
  });

  it('shows start command help', () => {
    const { stdout, status } = runCli('start --help');
    expect(status).toBe(0);
    expect(stdout).toContain('--port');
    expect(stdout).toContain('--host');
    expect(stdout).toContain('--tls');
    expect(stdout).toContain('--self-signed');
  });

  it('activate rejects invalid license key', () => {
    const { stderr, status } = runCli('activate invalid-key');
    expect(status).not.toBe(0);
    expect(stderr).toContain('Invalid license key');
  });

  it('activate accepts valid license key', async () => {
    const { generateTestLicenseKey } = await import('../helpers/license-helper.js');
    const licenseKey = generateTestLicenseKey({
      email: 'cli-test@example.com',
      plan: 'pro',
      maxSessions: 5,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    const { stdout, status } = runCli(`activate ${licenseKey}`);
    expect(status).toBe(0);
    expect(stdout).toContain('cli-test@example.com');
    expect(stdout).toContain('pro');
  });
});
