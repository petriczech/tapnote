import { createNote, deriveTitle, extractTags, isNote, Note } from './note';

const note: Note = {
  id: '1',
  title: 'Nákup',
  content: '- [ ] mléko',
  tags: ['domov'],
  pinned: false,
  archived: false,
  isTemplate: false,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('isNote', () => {
  it('accepts a valid note', () => {
    expect(isNote(note)).toBe(true);
  });

  it('accepts optional fields', () => {
    expect(isNote({ ...note, color: '#ff0', deletedAt: '2026-10-15T11:00:00.000Z' })).toBe(true);
  });

  it.each([null, 'note', [], 42])('rejects non-object %s', (value) => {
    expect(isNote(value)).toBe(false);
  });

  it('rejects a missing required field', () => {
    const withoutContent: Partial<Note> = { ...note };
    delete withoutContent.content;
    expect(isNote(withoutContent)).toBe(false);
  });

  it('rejects wrong field types', () => {
    expect(isNote({ ...note, pinned: 'true' })).toBe(false);
    expect(isNote({ ...note, tags: ['a', 1] })).toBe(false);
    expect(isNote({ ...note, color: 1 })).toBe(false);
  });
});

describe('createNote', () => {
  it('creates an empty valid note', () => {
    const created = createNote('1', '2026-10-15T10:00:00.000Z');

    expect(isNote(created)).toBe(true);
    expect(created.content).toBe('');
    expect(created.createdAt).toBe(created.updatedAt);
  });
});

describe('deriveTitle', () => {
  it.each([
    ['Nákup\nmléko', 'Nákup'],
    ['\n\n  Druhý řádek  \n', 'Druhý řádek'],
    ['## Nadpis', 'Nadpis'],
    ['#nakup', '#nakup'],
    ['#\nNákup', ''],
    ['', ''],
    ['   \n  ', ''],
  ])('derives %j as %j', (content, title) => {
    expect(deriveTitle(content)).toBe(title);
  });
});

describe('extractTags', () => {
  it.each([
    ['#nakup mléko #Domov', ['nakup', 'domov']],
    ['text\n#úkol a #úkol', ['úkol']],
    ['# Nadpis', []],
    ['email@domena.cz a a#b', []],
    ['#tag-1 #tag_2', ['tag-1', 'tag_2']],
    ['', []],
  ])('extracts tags from %j', (content, tags) => {
    expect(extractTags(content)).toEqual(tags);
  });
});
