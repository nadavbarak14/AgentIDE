import { describe, it, expect, beforeAll } from 'vitest';
import { packArtifact, verifyPackageContents, type PackageContentsResult } from '../helpers/artifact.js';

describe('Install: Package contents verification', { timeout: 60_000 }, () => {
  let result: PackageContentsResult;

  beforeAll(() => {
    const tarball = packArtifact();
    result = verifyPackageContents(tarball);
  });

  it('backend/dist/cli.js exists with shebang', () => {
    expect(result.hasCliJs).toBe(true);
    expect(result.cliHasShebang).toBe(true);
  });

  it('backend/dist/hub-entry.js exists', () => {
    expect(result.hasHubEntry).toBe(true);
  });

  it('frontend/dist/index.html exists', () => {
    expect(result.hasIndexHtml).toBe(true);
  });

  it('no source, test, or spec directories in package', () => {
    expect(result.hasNoSrc).toBe(true);
    expect(result.hasNoTests).toBe(true);
    expect(result.hasNoSpecs).toBe(true);
  });

  it('package.json has correct bin and metadata', () => {
    expect(result.packageJson).toBeDefined();
    const pkg = result.packageJson!;
    const bin = pkg.bin as Record<string, string>;
    expect(bin?.agentide).toBe('./backend/dist/cli.js');
    expect(pkg.name).toBe('c3-dashboard');
    expect(pkg.version).toBeDefined();
  });
});
