import { describe, it, expect } from 'vitest';
import { PreviewCookieJar } from '../../src/api/preview-proxy.js';

describe('PreviewCookieJar cleanup', () => {
  it('clear() removes all cookies for a session across ports', () => {
    const jar = new PreviewCookieJar();

    jar.store('session-1', 3000, 'token=abc');
    jar.store('session-1', 5173, 'auth=xyz');
    jar.store('session-2', 3000, 'other=val');

    expect(jar.get('session-1', 3000)).toBe('token=abc');
    expect(jar.get('session-1', 5173)).toBe('auth=xyz');
    expect(jar.size()).toBe(3);

    jar.clear('session-1');

    expect(jar.get('session-1', 3000)).toBe('');
    expect(jar.get('session-1', 5173)).toBe('');
    // session-2 is untouched
    expect(jar.get('session-2', 3000)).toBe('other=val');
    expect(jar.size()).toBe(1);
  });

  it('clear() is safe to call on non-existent session', () => {
    const jar = new PreviewCookieJar();
    jar.store('session-1', 3000, 'token=abc');

    jar.clear('non-existent');

    expect(jar.get('session-1', 3000)).toBe('token=abc');
    expect(jar.size()).toBe(1);
  });

  it('size() returns the number of session-port entries', () => {
    const jar = new PreviewCookieJar();

    expect(jar.size()).toBe(0);

    jar.store('s1', 3000, 'a=1');
    expect(jar.size()).toBe(1);

    jar.store('s1', 5000, 'b=2');
    expect(jar.size()).toBe(2);

    jar.store('s2', 3000, 'c=3');
    expect(jar.size()).toBe(3);

    jar.clear('s1');
    expect(jar.size()).toBe(1);
  });
});

describe('widgetStore cleanup pattern', () => {
  it('Map.delete removes all widgets for a session', () => {
    // This tests the same pattern used in hub-entry.ts:
    // widgetStore is Map<string, Map<string, Widget>>
    const widgetStore = new Map<string, Map<string, { html: string }>>();

    // Simulate widgets being added for two sessions
    const s1Widgets = new Map<string, { html: string }>();
    s1Widgets.set('widget-a', { html: '<div>A</div>' });
    s1Widgets.set('widget-b', { html: '<div>B</div>' });
    widgetStore.set('session-1', s1Widgets);

    const s2Widgets = new Map<string, { html: string }>();
    s2Widgets.set('widget-c', { html: '<div>C</div>' });
    widgetStore.set('session-2', s2Widgets);

    expect(widgetStore.size).toBe(2);

    // Simulate session-1 completing
    widgetStore.delete('session-1');

    expect(widgetStore.size).toBe(1);
    expect(widgetStore.has('session-1')).toBe(false);
    expect(widgetStore.get('session-2')?.size).toBe(1);
  });
});
