import { describe, it, expect } from 'vitest';
import { getCombinationKey, DEFAULT_STATE } from '../../src/hooks/usePanel';

describe('getCombinationKey', () => {
  it('returns just the panel name when left is active and right is none', () => {
    expect(getCombinationKey('files', 'none')).toBe('files');
  });

  it('returns just the panel name when left is none and right is active', () => {
    expect(getCombinationKey('none', 'git')).toBe('git');
  });

  it('returns sorted +-joined key when both panels are active (files+git)', () => {
    expect(getCombinationKey('files', 'git')).toBe('files+git');
  });

  it('returns just the panel name for preview when left is none', () => {
    expect(getCombinationKey('none', 'preview')).toBe('preview');
  });

  it('returns sorted +-joined key when both panels are active (files+preview)', () => {
    expect(getCombinationKey('files', 'preview')).toBe('files+preview');
  });

  it('returns empty string when both panels are none', () => {
    expect(getCombinationKey('none', 'none')).toBe('');
  });

  it('sorts alphabetically regardless of input order (git, files -> files+git)', () => {
    expect(getCombinationKey('git', 'files')).toBe('files+git');
  });
});

describe('DEFAULT_STATE viewport default', () => {
  it('defaults previewViewport to null (fill-screen mode)', () => {
    expect(DEFAULT_STATE.previewViewport).toBeNull();
  });

  it('does not default previewViewport to desktop', () => {
    expect(DEFAULT_STATE.previewViewport).not.toBe('desktop');
  });
});
