import { createNote, Note } from './note';
import { collectTags, isNotesView, queryNotes, snippet } from './note-query';

function note(id: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, '2026-10-15T10:00:00.000Z'), ...overrides };
}

const notes: Note[] = [
  note('old', { updatedAt: '2026-10-15T10:00:00.000Z', tags: ['a'] }),
  note('new', { updatedAt: '2026-10-15T12:00:00.000Z', tags: ['b'] }),
  note('pinned', { updatedAt: '2026-10-15T09:00:00.000Z', pinned: true, tags: ['a'] }),
  note('archived', { archived: true, tags: ['c'] }),
  note('trash-old', { deletedAt: '2026-10-10T10:00:00.000Z', tags: ['d'] }),
  note('trash-new', { deletedAt: '2026-10-12T10:00:00.000Z', archived: true }),
  note('template', { isTemplate: true, tags: ['a'] }),
];

const ids = (result: Note[]) => result.map((n) => n.id);

describe('queryNotes', () => {
  it('lists active notes, pinned first, then newest', () => {
    expect(ids(queryNotes(notes, 'notes'))).toEqual(['pinned', 'new', 'old']);
  });

  it('lists archived notes', () => {
    expect(ids(queryNotes(notes, 'archive'))).toEqual(['archived']);
  });

  it('lists the trash by deletion, archived ones included', () => {
    expect(ids(queryNotes(notes, 'trash'))).toEqual(['trash-new', 'trash-old']);
  });

  it('filters by tag', () => {
    expect(ids(queryNotes(notes, 'notes', 'a'))).toEqual(['pinned', 'old']);
  });
});

describe('collectTags', () => {
  it('collects sorted tags of a view without templates', () => {
    expect(collectTags(notes, 'notes')).toEqual(['a', 'b']);
    expect(collectTags(notes, 'trash')).toEqual(['d']);
  });

  it('sorts Czech tags', () => {
    expect(collectTags([note('1', { tags: ['čaj', 'cukr', 'dort'] })], 'notes')).toEqual(['cukr', 'čaj', 'dort']);
  });
});

describe('isNotesView', () => {
  it.each([
    ['notes', true],
    ['trash', true],
    ['other', false],
    [undefined, false],
  ])('accepts %j: %s', (value, expected) => {
    expect(isNotesView(value)).toBe(expected);
  });
});

describe('snippet', () => {
  it('skips the title line and joins the rest', () => {
    expect(snippet('\nNákup\n- [ ] mléko\n\n- [ ] chleba')).toBe('- [ ] mléko - [ ] chleba');
  });

  it('shortens long text', () => {
    expect(snippet(`titulek\n${'a'.repeat(300)}`)).toHaveLength(160);
  });

  it('is empty for a single line', () => {
    expect(snippet('jen titulek')).toBe('');
  });
});
