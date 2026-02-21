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

describe('Element Targeting — clickElement (c3:clickElement)', () => {
  let env: ReturnType<typeof createBridgeEnv>;

  it('clicks a button by role and name', () => {
    env = createBridgeEnv(`
      <button id="save-btn">Save</button>
      <button id="cancel-btn">Cancel</button>
    `);

    let clicked = false;
    const btn = env.window.document.getElementById('save-btn')!;
    btn.addEventListener('click', () => { clicked = true; });

    env.clearMessages();
    env.sendCommand({ type: 'c3:clickElement', role: 'button', name: 'Save', msgId: 'c1' });

    const responses = env.getMessages('c3:bridge:elementClicked');
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(true);
    expect(responses[0].msgId).toBe('c1');
    expect(clicked).toBe(true);
  });

  it('clicks a link by role and name', () => {
    env = createBridgeEnv(`
      <a href="/home" id="home-link">Home</a>
      <a href="/about" id="about-link">About</a>
    `);

    let clicked = false;
    const link = env.window.document.getElementById('about-link')!;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      clicked = true;
    });

    env.clearMessages();
    env.sendCommand({ type: 'c3:clickElement', role: 'link', name: 'About', msgId: 'c2' });

    const responses = env.getMessages('c3:bridge:elementClicked');
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(true);
    expect(clicked).toBe(true);
  });

  it('matches element name case-insensitively', () => {
    env = createBridgeEnv(`<button id="btn">Submit Form</button>`);

    let clicked = false;
    env.window.document.getElementById('btn')!.addEventListener('click', () => { clicked = true; });

    env.clearMessages();
    env.sendCommand({ type: 'c3:clickElement', role: 'button', name: 'submit form', msgId: 'c3' });

    const responses = env.getMessages('c3:bridge:elementClicked');
    expect(responses[0].ok).toBe(true);
    expect(clicked).toBe(true);
  });

  it('returns error with available elements when no match found', () => {
    env = createBridgeEnv(`
      <button>Save</button>
      <button>Delete</button>
    `);

    env.clearMessages();
    env.sendCommand({ type: 'c3:clickElement', role: 'button', name: 'Update', msgId: 'c4' });

    const responses = env.getMessages('c3:bridge:elementClicked');
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(false);
    expect(responses[0].error).toContain('Element not found');
    expect(responses[0].error).toContain('button');
    expect(responses[0].error).toContain('Update');

    const available = responses[0].available as string[];
    expect(available).toContain('Save');
    expect(available).toContain('Delete');
  });

  it('dispatches mousedown, mouseup, click events in order', () => {
    env = createBridgeEnv(`<button id="btn">Click Me</button>`);

    const events: string[] = [];
    const btn = env.window.document.getElementById('btn')!;
    btn.addEventListener('mousedown', () => events.push('mousedown'));
    btn.addEventListener('mouseup', () => events.push('mouseup'));
    btn.addEventListener('click', () => events.push('click'));

    env.clearMessages();
    env.sendCommand({ type: 'c3:clickElement', role: 'button', name: 'Click Me', msgId: 'c5' });

    expect(events).toEqual(['mousedown', 'mouseup', 'click']);
  });

  it('skips hidden elements when searching', () => {
    env = createBridgeEnv(`
      <button style="display:none">Save</button>
      <button id="visible-save">Save</button>
    `);

    let clicked = false;
    env.window.document.getElementById('visible-save')!.addEventListener('click', () => { clicked = true; });

    env.clearMessages();
    env.sendCommand({ type: 'c3:clickElement', role: 'button', name: 'Save', msgId: 'c6' });

    const responses = env.getMessages('c3:bridge:elementClicked');
    expect(responses[0].ok).toBe(true);
    expect(clicked).toBe(true);
  });
});

describe('Element Targeting — typeElement (c3:typeElement)', () => {
  let env: ReturnType<typeof createBridgeEnv>;

  it('types into a textbox and dispatches input/change events', () => {
    env = createBridgeEnv(`
      <input type="text" id="email" aria-label="Email" />
    `);

    const events: string[] = [];
    const input = env.window.document.getElementById('email') as HTMLInputElement;
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'textbox',
      name: 'Email',
      text: 'user@test.com',
      msgId: 't1',
    });

    const responses = env.getMessages('c3:bridge:elementTyped');
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(true);
    expect(responses[0].msgId).toBe('t1');
    expect(input.value).toBe('user@test.com');
    expect(events).toContain('input');
    expect(events).toContain('change');
  });

  it('types into a textarea', () => {
    env = createBridgeEnv(`
      <textarea id="notes" aria-label="Notes"></textarea>
    `);

    const textarea = env.window.document.getElementById('notes') as HTMLTextAreaElement;

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'textbox',
      name: 'Notes',
      text: 'Some notes here',
      msgId: 't2',
    });

    const responses = env.getMessages('c3:bridge:elementTyped');
    expect(responses[0].ok).toBe(true);
    expect(textarea.value).toBe('Some notes here');
  });

  it('returns error when element is not found', () => {
    env = createBridgeEnv(`
      <input type="text" aria-label="Username" />
    `);

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'textbox',
      name: 'Password',
      text: 'secret',
      msgId: 't3',
    });

    const responses = env.getMessages('c3:bridge:elementTyped');
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(false);
    expect(responses[0].error).toContain('Element not found');
    expect(responses[0].available).toEqual(['Username']);
  });

  it('returns error when typing into a non-input element', () => {
    env = createBridgeEnv(`
      <h1>Page Title</h1>
    `);

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'heading',
      name: 'Page Title',
      text: 'new title',
      msgId: 't4',
    });

    const responses = env.getMessages('c3:bridge:elementTyped');
    expect(responses.length).toBe(1);
    expect(responses[0].ok).toBe(false);
    expect(responses[0].error).toContain('not an input');
  });

  it('types into searchbox input', () => {
    env = createBridgeEnv(`
      <input type="search" id="search" placeholder="Search..." />
    `);

    const input = env.window.document.getElementById('search') as HTMLInputElement;

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'searchbox',
      name: 'Search...',
      text: 'vitest',
      msgId: 't5',
    });

    const responses = env.getMessages('c3:bridge:elementTyped');
    expect(responses[0].ok).toBe(true);
    expect(input.value).toBe('vitest');
  });

  it('matches element name case-insensitively for typing', () => {
    env = createBridgeEnv(`
      <input type="text" aria-label="First Name" />
    `);

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'textbox',
      name: 'first name',
      text: 'Alice',
      msgId: 't6',
    });

    const responses = env.getMessages('c3:bridge:elementTyped');
    expect(responses[0].ok).toBe(true);
  });

  it('focuses the element before typing', () => {
    env = createBridgeEnv(`
      <input type="text" id="field" aria-label="Field" />
    `);

    let focused = false;
    env.window.document.getElementById('field')!.addEventListener('focus', () => { focused = true; });

    env.clearMessages();
    env.sendCommand({
      type: 'c3:typeElement',
      role: 'textbox',
      name: 'Field',
      text: 'hello',
      msgId: 't7',
    });

    expect(focused).toBe(true);
  });
});
