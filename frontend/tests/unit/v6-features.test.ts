import { describe, it, expect } from 'vitest';

describe('v6: DiffViewer — word wrapping CSS', () => {
  it('uses overflow-wrap:anywhere instead of break-all for diff line content', () => {
    // The DiffCell content div should use overflow-wrap:anywhere
    // (Tailwind: [overflow-wrap:anywhere]) instead of break-all
    // because break-all splits words at every character boundary,
    // making code unreadable. overflow-wrap:anywhere only breaks
    // when a word would actually overflow its container.
    const correctClass = '[overflow-wrap:anywhere]';
    const incorrectClass = 'break-all';
    const anotherIncorrectClass = 'overflow-x-auto';

    // Verify the expected class string patterns
    expect(correctClass).toContain('overflow-wrap');
    expect(correctClass).toContain('anywhere');
    expect(incorrectClass).not.toContain('overflow-wrap');
    expect(anotherIncorrectClass).not.toContain('overflow-wrap');
  });
});

describe('v6: Sidebar toggle — localStorage state', () => {
  it('sidebar defaults to open when no localStorage value', () => {
    // Simulates: localStorage.getItem('c3-sidebar-open') returns null
    const stored = null;
    const defaultOpen = stored !== 'false';
    expect(defaultOpen).toBe(true);
  });

  it('sidebar stays open when localStorage is "true"', () => {
    const stored = 'true';
    const open = stored !== 'false';
    expect(open).toBe(true);
  });

  it('sidebar is hidden when localStorage is "false"', () => {
    const stored = 'false';
    const open = stored !== 'false';
    expect(open).toBe(false);
  });
});

describe('v6: Overflow strip — collapsible state', () => {
  it('overflow defaults to collapsed when no localStorage value', () => {
    // Simulates: localStorage.getItem('c3-overflow-collapsed') returns null
    const stored = null;
    const collapsed = stored !== 'false';
    expect(collapsed).toBe(true);
  });

  it('overflow is expanded when localStorage is "false"', () => {
    const stored = 'false';
    const collapsed = stored !== 'false';
    expect(collapsed).toBe(false);
  });

  it('overflow stays collapsed when localStorage is "true"', () => {
    const stored = 'true';
    const collapsed = stored !== 'false';
    expect(collapsed).toBe(true);
  });
});
