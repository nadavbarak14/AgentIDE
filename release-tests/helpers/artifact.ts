import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ReleaseEnvironment } from './environment.js';

export interface InstalledArtifact {
  tarballPath: string;
  binaryPath: string;
  version: string;
}

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../..');

// Cache the tarball path across the test run (pack once, install many)
let cachedTarball: string | null = null;

export function packArtifact(): string {
  if (process.env.RELEASE_TARBALL) {
    return process.env.RELEASE_TARBALL;
  }
  if (cachedTarball && fs.existsSync(cachedTarball)) {
    return cachedTarball;
  }

  const output = execSync('npm pack --json 2>/dev/null', {
    cwd: PROJECT_ROOT,
    encoding: 'utf-8',
  });

  // npm pack --json returns a JSON array with filename
  const parsed = JSON.parse(output);
  const filename = Array.isArray(parsed) ? parsed[0].filename : parsed.filename;
  cachedTarball = path.join(PROJECT_ROOT, filename);

  if (!fs.existsSync(cachedTarball)) {
    throw new Error(`npm pack produced no tarball at ${cachedTarball}`);
  }

  return cachedTarball;
}

export function installArtifact(
  env: ReleaseEnvironment,
  tarballPath: string,
): InstalledArtifact {
  execSync(`npm install -g "${tarballPath}"`, {
    cwd: env.dataDir,
    env: env.env,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const binaryPath = path.join(env.binDir, 'agentide');
  if (!fs.existsSync(binaryPath)) {
    // On some npm versions, bin goes to lib/node_modules/.bin/
    const altBinDir = path.join(env.npmPrefix, 'lib', 'node_modules', '.bin');
    const altPath = path.join(altBinDir, 'agentide');
    if (fs.existsSync(altPath)) {
      return {
        tarballPath,
        binaryPath: altPath,
        version: getInstalledVersion(env),
      };
    }
    throw new Error(
      `agentide binary not found at ${binaryPath}. Contents of binDir: ${fs.readdirSync(env.binDir).join(', ') || '(empty)'}`,
    );
  }

  return {
    tarballPath,
    binaryPath,
    version: getInstalledVersion(env),
  };
}

function getInstalledVersion(env: ReleaseEnvironment): string {
  const pkgJsonPath = path.join(
    env.npmPrefix,
    'lib',
    'node_modules',
    'c3-dashboard',
    'package.json',
  );
  if (fs.existsSync(pkgJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    return pkg.version;
  }
  // Fallback: read from project root
  const rootPkg = JSON.parse(
    fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'),
  );
  return rootPkg.version;
}

export interface PackageContentsResult {
  hasCliJs: boolean;
  hasHubEntry: boolean;
  hasIndexHtml: boolean;
  hasNoSrc: boolean;
  hasNoTests: boolean;
  hasNoSpecs: boolean;
  cliHasShebang: boolean;
  packageJson: Record<string, unknown> | null;
}

export function verifyPackageContents(tarballPath: string): PackageContentsResult {
  const tmpDir = fs.mkdtempSync(path.join(import.meta.dirname, '../../.tmp-verify-'));
  try {
    execSync(`tar xzf "${tarballPath}" -C "${tmpDir}"`, { encoding: 'utf-8' });

    const pkgDir = path.join(tmpDir, 'package');

    const cliPath = path.join(pkgDir, 'backend', 'dist', 'cli.js');
    const hasCliJs = fs.existsSync(cliPath);
    let cliHasShebang = false;
    if (hasCliJs) {
      const firstLine = fs.readFileSync(cliPath, 'utf-8').split('\n')[0];
      cliHasShebang = firstLine.startsWith('#!/usr/bin/env node');
    }

    const hasHubEntry = fs.existsSync(
      path.join(pkgDir, 'backend', 'dist', 'hub-entry.js'),
    );
    const hasIndexHtml = fs.existsSync(
      path.join(pkgDir, 'frontend', 'dist', 'index.html'),
    );
    const hasNoSrc = !fs.existsSync(path.join(pkgDir, 'src'));
    const hasNoTests = !fs.existsSync(path.join(pkgDir, 'tests'));
    const hasNoSpecs = !fs.existsSync(path.join(pkgDir, 'specs'));

    let packageJson: Record<string, unknown> | null = null;
    const pkgJsonPath = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    }

    return {
      hasCliJs,
      hasHubEntry,
      hasIndexHtml,
      hasNoSrc,
      hasNoTests,
      hasNoSpecs,
      cliHasShebang,
      packageJson,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
