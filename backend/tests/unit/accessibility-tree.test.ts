import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const bridgeSource = fs.readFileSync(
  path.join(import.meta.dirname, '../../src/api/inspect-bridge.js'),
  'utf-8',
);

/**
 * Create a JSDOM environment, inject HTML into the body, eval the bridge script,
 * and return a helper that sends postMessage commands and collects responses.
 */
function createBridgeEnv(bodyHtml: string) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>${bodyHtml}</body></html>`,
    {
      url: 'http://localhost:3000/',
      pretendToBeVisual: true,
      runScripts: 'dangerously',
    },
  );

  const { window } = dom;
  const messages: Array<Record<string, unknown>> = [];

  // Override parent.postMessage to capture bridge responses
  Object.defineProperty(window, 'parent', {
    value: {
      postMessage(data: Record<string, unknown>) {
        messages.push(data);
      },
    },
    writable: false,
  });

  // Stub getComputedStyle to return sensible defaults for visibility checks
  const originalGCS = window.getComputedStyle.bind(window);
  window.getComputedStyle = function (el: Element) {
    try {
      return originalGCS(el);
    } catch {
      // JSDOM sometimes throws for detached elements; return safe defaults
      return { display: 'block', visibility: 'visible' } as unknown as CSSStyleDeclaration;
    }
  };

  // Stub scrollIntoView — not implemented in JSDOM
  window.Element.prototype.scrollIntoView = function () {};

  // Eval the bridge script in the JSDOM context
  window.eval(bridgeSource);

  function sendCommand(data: Record<string, unknown>): void {
    const event = new window.MessageEvent('message', { data });
    window.dispatchEvent(event);
  }

  function getMessages(type?: string) {
    if (!type) return messages;
    return messages.filter((m) => m.type === type);
  }

  function clearMessages() {
    messages.length = 0;
  }

  return { dom, window, sendCommand, getMessages, clearMessages };
}

describe('Accessibility Tree Extraction (c3:readPage)', () => {
  let env: ReturnType<typeof createBridgeEnv>;

  function readPage(): string {
    env.clearMessages();
    env.sendCommand({ type: 'c3:readPage', msgId: 'test-1' });
    const responses = env.getMessages('c3:bridge:pageRead');
    expect(responses.length).toBe(1);
    return responses[0].tree as string;
  }

  it('returns correct tree for basic HTML with headings and paragraphs', () => {
    env = createBridgeEnv(`
      <main>
        <h1>Welcome</h1>
        <p>Hello world</p>
        <h2>Section</h2>
      </main>
    `);

    const tree = readPage();

    expect(tree).toContain('main');
    expect(tree).toContain('heading "Welcome" level=1');
    expect(tree).toContain('heading "Section" level=2');
    // Paragraphs have no implicit ARIA role, so they should not appear
    expect(tree).not.toContain('paragraph');
  });

  it('assigns role "button" to button elements', () => {
    env = createBridgeEnv(`
      <button>Save</button>
      <button>Cancel</button>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Save"');
    expect(tree).toContain('button "Cancel"');
  });

  it('assigns role "link" with href to anchor elements', () => {
    env = createBridgeEnv(`
      <a href="/about">About Us</a>
      <a href="https://example.com/very-long-url-that-exceeds-the-sixty-character-limit-for-display-in-the-tree">Long Link</a>
    `);

    const tree = readPage();

    expect(tree).toContain('link "About Us" href="/about"');
    // The long href should be omitted (> 60 chars)
    expect(tree).toContain('link "Long Link"');
    expect(tree).not.toContain('very-long-url');
  });

  it('assigns correct roles to input elements by type', () => {
    env = createBridgeEnv(`
      <input type="text" placeholder="Username" />
      <input type="checkbox" aria-label="Agree" />
      <input type="radio" aria-label="Option A" />
      <input type="submit" value="Go" />
      <input type="search" placeholder="Search..." />
    `);

    const tree = readPage();

    expect(tree).toContain('textbox "Username"');
    expect(tree).toContain('checkbox "Agree"');
    expect(tree).toContain('radio "Option A"');
    expect(tree).toContain('button "Go"');
    expect(tree).toContain('searchbox "Search..."');
  });

  it('excludes elements with display:none', () => {
    env = createBridgeEnv(`
      <button>Visible</button>
      <button style="display:none">Hidden</button>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Visible"');
    expect(tree).not.toContain('Hidden');
  });

  it('excludes elements with visibility:hidden', () => {
    env = createBridgeEnv(`
      <button>Shown</button>
      <button style="visibility:hidden">Invisible</button>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Shown"');
    expect(tree).not.toContain('Invisible');
  });

  it('excludes elements with aria-hidden="true"', () => {
    env = createBridgeEnv(`
      <button>Active</button>
      <div aria-hidden="true">
        <button>Decorative</button>
      </div>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Active"');
    expect(tree).not.toContain('Decorative');
  });

  it('uses aria-label over text content for accessible name', () => {
    env = createBridgeEnv(`
      <button aria-label="Close dialog">X</button>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Close dialog"');
    expect(tree).not.toContain('"X"');
  });

  it('shows correct indentation for nested structure', () => {
    env = createBridgeEnv(`
      <nav>
        <ul>
          <li><a href="/home">Home</a></li>
          <li><a href="/about">About</a></li>
        </ul>
      </nav>
    `);

    const tree = readPage();
    const lines = tree.split('\n');

    // Find the navigation line
    const navLine = lines.find((l) => l.includes('navigation'));
    expect(navLine).toBeDefined();
    // Navigation should be at depth 0 (no leading spaces)
    expect(navLine!.startsWith('navigation')).toBe(true);

    // The list should be indented under navigation
    const listLine = lines.find((l) => l.includes('list'));
    expect(listLine).toBeDefined();
    expect(listLine!.startsWith('  list')).toBe(true);

    // List items should be further indented
    const listItemLines = lines.filter((l) => l.includes('listitem'));
    expect(listItemLines.length).toBe(2);
    for (const li of listItemLines) {
      expect(li.startsWith('    listitem')).toBe(true);
    }

    // Links should be nested under list items
    const linkLines = lines.filter((l) => l.includes('link'));
    expect(linkLines.length).toBe(2);
    for (const link of linkLines) {
      expect(link.startsWith('      link')).toBe(true);
    }
  });

  it('assigns correct roles to landmark elements', () => {
    env = createBridgeEnv(`
      <nav>Navigation</nav>
      <main>Main content</main>
      <footer>Footer</footer>
      <header>Header</header>
      <aside>Sidebar</aside>
    `);

    const tree = readPage();

    expect(tree).toContain('navigation');
    expect(tree).toContain('main');
    expect(tree).toContain('contentinfo');
    expect(tree).toContain('banner');
    expect(tree).toContain('complementary');
  });

  it('assigns correct roles to lists', () => {
    env = createBridgeEnv(`
      <ul>
        <li>Item 1</li>
        <li>Item 2</li>
      </ul>
    `);

    const tree = readPage();

    expect(tree).toContain('list');
    expect(tree).toContain('listitem');
  });

  it('skips elements with no implicit role (e.g. div, span, p)', () => {
    env = createBridgeEnv(`
      <div>
        <span>Some text</span>
        <p>Paragraph</p>
        <button>Real Button</button>
      </div>
    `);

    const tree = readPage();

    // Only the button should appear since div/span/p have no implicit role
    expect(tree).toContain('button "Real Button"');
    // The tree should not have entries for "Some text" or "Paragraph" as standalone roles
    const lines = tree.split('\n').filter((l) => l.trim());
    // All lines should be the button line only
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('button');
  });

  it('includes checkbox and radio state (checked/unchecked)', () => {
    env = createBridgeEnv(`
      <input type="checkbox" aria-label="Terms" checked />
      <input type="radio" aria-label="Red" />
    `);

    const tree = readPage();

    expect(tree).toContain('checkbox "Terms" checked');
    expect(tree).toContain('radio "Red" unchecked');
  });

  it('includes textbox value and attributes', () => {
    env = createBridgeEnv(`
      <input type="text" aria-label="Email" value="test@example.com" required />
      <textarea aria-label="Notes" readonly></textarea>
    `);

    const tree = readPage();

    expect(tree).toContain('textbox "Email" value="test@example.com" required');
    expect(tree).toContain('textbox "Notes"');
    expect(tree).toContain('readonly');
  });

  it('includes disabled state on buttons', () => {
    env = createBridgeEnv(`
      <button disabled>Disabled Btn</button>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Disabled Btn" disabled');
  });

  it('includes aria-expanded attribute', () => {
    env = createBridgeEnv(`
      <button aria-expanded="true">Menu</button>
    `);

    const tree = readPage();

    expect(tree).toContain('button "Menu" expanded=true');
  });

  it('includes msgId in the response', () => {
    env = createBridgeEnv('<button>OK</button>');
    env.clearMessages();
    env.sendCommand({ type: 'c3:readPage', msgId: 'msg-42' });

    const responses = env.getMessages('c3:bridge:pageRead');
    expect(responses[0].msgId).toBe('msg-42');
  });

  it('emits bridge:ready on load', () => {
    env = createBridgeEnv('<div>test</div>');
    const ready = env.getMessages('c3:bridge:ready');
    expect(ready.length).toBe(1);
  });
});
