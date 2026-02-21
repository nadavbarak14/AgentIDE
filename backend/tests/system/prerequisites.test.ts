import { describe, it, expect } from 'vitest';
import { checkPrerequisites, detectWSLVersion } from '../../src/services/prerequisites.js';

describe('Prerequisites System Test', () => {
  it('checkPrerequisites runs without errors and returns results', () => {
    const results = checkPrerequisites();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    // grep should be available in any Linux/CI environment
    const grepResult = results.find((r) => r.tool === 'grep');
    expect(grepResult).toBeDefined();
    expect(grepResult!.available).toBe(true);
  });

  it('detectWSLVersion runs without crashing regardless of platform', () => {
    // On native Linux / CI, this should return 'none' or 'wsl2'
    // The key assertion is that it doesn't throw
    const version = detectWSLVersion();
    expect(['wsl2', 'wsl1', 'none']).toContain(version);
  });

  it('detectWSLVersion returns a consistent result on repeated calls', () => {
    const first = detectWSLVersion();
    const second = detectWSLVersion();
    expect(first).toBe(second);
  });
});
