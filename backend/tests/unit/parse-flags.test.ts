import { describe, it, expect } from 'vitest';
import { parseFlags } from '../../src/services/session-manager.js';

describe('parseFlags', () => {
  it('returns empty array for empty string', () => {
    expect(parseFlags('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseFlags('   ')).toEqual([]);
  });

  it('parses a single flag', () => {
    expect(parseFlags('--dangerously-skip-permissions')).toEqual([
      '--dangerously-skip-permissions',
    ]);
  });

  it('parses multiple flags separated by spaces', () => {
    expect(parseFlags('--dangerously-skip-permissions --verbose')).toEqual([
      '--dangerously-skip-permissions',
      '--verbose',
    ]);
  });

  it('handles leading and trailing whitespace', () => {
    expect(parseFlags('  --flag1  --flag2  ')).toEqual(['--flag1', '--flag2']);
  });

  it('preserves quoted values as separate tokens', () => {
    expect(parseFlags('--allowedTools "Read,Grep"')).toEqual([
      '--allowedTools',
      'Read,Grep',
    ]);
  });

  it('handles single-quoted values', () => {
    expect(parseFlags("--allowedTools 'Read,Grep'")).toEqual([
      '--allowedTools',
      'Read,Grep',
    ]);
  });

  it('deduplicates flags by name, keeping last occurrence', () => {
    expect(parseFlags('--verbose --quiet --verbose')).toEqual([
      '--quiet',
      '--verbose',
    ]);
  });

  it('handles flag=value syntax', () => {
    expect(parseFlags('--model=opus --max-turns=5')).toEqual([
      '--model=opus',
      '--max-turns=5',
    ]);
  });

  it('handles tabs as separators', () => {
    expect(parseFlags('--flag1\t--flag2')).toEqual(['--flag1', '--flag2']);
  });

  it('handles mixed quoted and unquoted values', () => {
    expect(
      parseFlags('--dangerously-skip-permissions --allowedTools "Read,Grep" --verbose'),
    ).toEqual(['--dangerously-skip-permissions', '--allowedTools', 'Read,Grep', '--verbose']);
  });
});
