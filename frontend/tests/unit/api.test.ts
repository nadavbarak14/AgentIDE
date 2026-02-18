import { describe, it, expect } from 'vitest';
import { panelState, comments } from '../../src/services/api';

describe('API module', () => {
  it('exports panelState API methods', () => {
    expect(panelState).toBeDefined();
    expect(typeof panelState.get).toBe('function');
    expect(typeof panelState.save).toBe('function');
  });

  it('exports comments API methods', () => {
    expect(comments).toBeDefined();
    expect(typeof comments.list).toBe('function');
    expect(typeof comments.create).toBe('function');
    expect(typeof comments.deliver).toBe('function');
  });
});
