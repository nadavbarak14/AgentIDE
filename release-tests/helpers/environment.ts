import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ReleaseEnvironment {
  tempDir: string;
  homeDir: string;
  npmPrefix: string;
  binDir: string;
  dataDir: string;
  env: Record<string, string>;
  cleanup(): Promise<void>;
}

export async function createReleaseEnvironment(): Promise<ReleaseEnvironment> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adyx-release-'));
  const homeDir = path.join(tempDir, 'home');
  const npmPrefix = path.join(tempDir, 'npm-global');
  const binDir = path.join(npmPrefix, 'bin');
  const dataDir = path.join(homeDir, 'data');

  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HOME: homeDir,
    npm_config_prefix: npmPrefix,
    PATH: `${binDir}:${process.env.PATH || ''}`,
    LOG_LEVEL: 'info',
  };

  return {
    tempDir,
    homeDir,
    npmPrefix,
    binDir,
    dataDir,
    env,
    async cleanup() {
      if (process.env.RELEASE_KEEP_TEMP === 'true') {
        console.log(`[release-test] Keeping temp dir: ${tempDir}`);
        return;
      }
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    },
  };
}
