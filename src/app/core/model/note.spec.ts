import { isNote, isNotesExport, Note } from './note';

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

describe('isNotesExport', () => {
  const exported = { schemaVersion: 1, exportedAt: '2026-10-15T12:00:00.000Z', notes: [note] };

  it('accepts a valid export', () => {
    expect(isNotesExport(exported)).toBe(true);
  });

  it('rejects an unknown schema version', () => {
    expect(isNotesExport({ ...exported, schemaVersion: 2 })).toBe(false);
  });

  it('rejects an invalid note', () => {
    expect(isNotesExport({ ...exported, notes: [{ ...note, id: 1 }] })).toBe(false);
  });
});
