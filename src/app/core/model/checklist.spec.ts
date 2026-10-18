import { continueList, hasChecklist, parseSegments, TextEdit, toggleItem, toggleItemPrefix } from './checklist';

function apply(value: string, edit: TextEdit): string {
  return value.slice(0, edit.from) + edit.insert + value.slice(edit.to);
}

describe('hasChecklist', () => {
  it.each([
    ['- [ ] a', true],
    ['text\n  * [x] b', true],
    ['+ [X]', true],
    ['- [] a', false],
    ['-[ ] a', false],
    ['text', false],
  ])('detects %j as %s', (content, expected) => {
    expect(hasChecklist(content)).toBe(expected);
  });
});

describe('parseSegments', () => {
  it('splits text and checklist blocks', () => {
    const segments = parseSegments('Nákup\n- [ ] mléko\n- [x] chleba\n- [ ] máslo\n\nkonec');

    expect(segments).toEqual([
      { kind: 'text', line: 0, text: 'Nákup' },
      {
        kind: 'checklist',
        open: [
          { line: 1, level: 0, checked: false, text: 'mléko' },
          { line: 3, level: 0, checked: false, text: 'máslo' },
        ],
        done: [{ line: 2, level: 0, checked: true, text: 'chleba' }],
        doneCount: 1,
      },
      { kind: 'text', line: 4, text: '' },
      { kind: 'text', line: 5, text: 'konec' },
    ]);
  });

  it('keeps sub-items with their parent', () => {
    const [segment] = parseSegments('- [x] ovoce\n  - [ ] jablka\n- [ ] zelenina');

    expect(segment).toEqual({
      kind: 'checklist',
      open: [{ line: 2, level: 0, checked: false, text: 'zelenina' }],
      done: [
        { line: 0, level: 0, checked: true, text: 'ovoce' },
        { line: 1, level: 1, checked: false, text: 'jablka' },
      ],
      doneCount: 1,
    });
  });

  it('accepts an item without text', () => {
    const [segment] = parseSegments('- [ ]');

    expect(segment).toEqual({
      kind: 'checklist',
      open: [{ line: 0, level: 0, checked: false, text: '' }],
      done: [],
      doneCount: 0,
    });
  });
});

describe('toggleItem', () => {
  it('moves a checked item to the end of its block', () => {
    expect(toggleItem('- [ ] a\n- [ ] b\n- [ ] c\nkonec', 0)).toBe('- [ ] b\n- [ ] c\n- [x] a\nkonec');
  });

  it('moves an unchecked item after the last open item', () => {
    expect(toggleItem('- [ ] a\n- [x] b\n- [x] c', 2)).toBe('- [ ] a\n- [ ] c\n- [x] b');
  });

  it('moves an unchecked item to the top when nothing is open', () => {
    expect(toggleItem('- [x] a\n- [x] b', 1)).toBe('- [ ] b\n- [x] a');
  });

  it('moves sub-items with their parent', () => {
    expect(toggleItem('- [ ] a\n  - [ ] a1\n- [ ] b', 0)).toBe('- [ ] b\n- [x] a\n  - [ ] a1');
  });

  it('toggles a sub-item in place', () => {
    expect(toggleItem('- [ ] a\n  - [ ] a1\n  - [ ] a2', 1)).toBe('- [ ] a\n  - [x] a1\n  - [ ] a2');
  });

  it('only touches its own block', () => {
    expect(toggleItem('- [ ] a\n- [ ] b\n\n- [ ] c', 0)).toBe('- [ ] b\n- [x] a\n\n- [ ] c');
  });

  it('accepts uppercase X and other bullets', () => {
    expect(toggleItem('* [X] a\n* [ ] b', 0)).toBe('* [ ] b\n* [ ] a');
  });

  it('ignores a line that is not an item', () => {
    expect(toggleItem('text', 0)).toBe('text');
    expect(toggleItem('text', 5)).toBe('text');
  });
});

describe('continueList', () => {
  it('adds a new item after a filled item', () => {
    const value = '- [ ] mléko';
    const edit = continueList(value, value.length);

    expect(edit && apply(value, edit)).toBe('- [ ] mléko\n- [ ] ');
    expect(edit?.cursor).toBe(value.length + 7);
  });

  it('keeps indent and bullet', () => {
    const value = '  * [x] a';
    const edit = continueList(value, value.length);

    expect(edit && apply(value, edit)).toBe('  * [x] a\n  * [ ] ');
  });

  it('splits the item text at the cursor', () => {
    const value = '- [ ] mléko chleba';
    const edit = continueList(value, 11);

    expect(edit && apply(value, edit)).toBe('- [ ] mléko\n- [ ]  chleba');
  });

  it('ends the list on an empty item', () => {
    const value = '- [ ] a\n- [ ] ';
    const edit = continueList(value, value.length);

    expect(edit && apply(value, edit)).toBe('- [ ] a\n');
    expect(edit?.cursor).toBe(8);
  });

  it('does nothing outside an item or inside its prefix', () => {
    expect(continueList('text', 4)).toBeUndefined();
    expect(continueList('- [ ] a', 0)).toBeUndefined();
    expect(continueList('- [ ] a', 3)).toBeUndefined();
    expect(continueList('- [ ] a', 5)).toBeUndefined();
  });
});

describe('toggleItemPrefix', () => {
  it('adds a prefix to a plain line', () => {
    const value = 'a\nmléko';
    const edit = toggleItemPrefix(value, value.length);

    expect(apply(value, edit)).toBe('a\n- [ ] mléko');
    expect(edit.cursor).toBe(value.length + 6);
  });

  it('adds a prefix after the indent', () => {
    expect(apply('  a', toggleItemPrefix('  a', 3))).toBe('  - [ ] a');
  });

  it('adds a prefix to an empty first line', () => {
    expect(apply('\nabc', toggleItemPrefix('\nabc', 0))).toBe('- [ ] \nabc');
  });

  it('adds a prefix to an empty line', () => {
    const edit = toggleItemPrefix('', 0);

    expect(apply('', edit)).toBe('- [ ] ');
    expect(edit.cursor).toBe(6);
  });

  it('removes the prefix from an item', () => {
    const value = '- [x] mléko';
    const edit = toggleItemPrefix(value, value.length);

    expect(apply(value, edit)).toBe('mléko');
    expect(edit.cursor).toBe(5);
  });

  it('removes a prefix without text', () => {
    expect(apply('- [ ]', toggleItemPrefix('- [ ]', 5))).toBe('');
  });

  it('moves a cursor inside the prefix to its start', () => {
    expect(toggleItemPrefix('- [ ] a', 2).cursor).toBe(0);
  });
});
