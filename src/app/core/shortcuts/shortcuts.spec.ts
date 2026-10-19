import { isPlainKey, readShortcutsEnabled, SHORTCUTS_KEY, writeShortcutsEnabled } from './shortcuts';

describe('shortcuts', () => {
  afterEach(() => localStorage.removeItem(SHORTCUTS_KEY));

  it('is enabled by default and remembers turning off', () => {
    expect(readShortcutsEnabled()).toBe(true);

    writeShortcutsEnabled(false);
    expect(readShortcutsEnabled()).toBe(false);

    writeShortcutsEnabled(true);
    expect(readShortcutsEnabled()).toBe(true);
  });

  function keydown(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
    let received!: KeyboardEvent;
    target.addEventListener('keydown', (event) => (received = event), { once: true });
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }));
    return received;
  }

  it('accepts a plain key outside text fields', () => {
    expect(isPlainKey(keydown(document.body, { key: 'c' }))).toBe(true);
    expect(isPlainKey(keydown(document.body, { key: '?', shiftKey: true }))).toBe(true);
  });

  it('ignores typing and modified keys', () => {
    const input = document.body.appendChild(document.createElement('input'));
    const textarea = document.body.appendChild(document.createElement('textarea'));

    expect(isPlainKey(keydown(input, { key: 'c' }))).toBe(false);
    expect(isPlainKey(keydown(textarea, { key: 'c' }))).toBe(false);
    expect(isPlainKey(keydown(document.body, { key: 'c', ctrlKey: true }))).toBe(false);
    expect(isPlainKey(keydown(document.body, { key: 'c', metaKey: true }))).toBe(false);

    input.remove();
    textarea.remove();
  });
});
