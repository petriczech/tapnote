import { createNote, Note } from '../model/note';
import {
  createExport,
  daysWithoutBackup,
  exportFileName,
  LAST_BACKUP_KEY,
  mergeNotes,
  parseExport,
  readLastBackup,
  writeLastBackup,
} from './notes-backup';

const NOW = new Date('2026-10-19T12:00:00.000Z');

function note(id: string, updatedAt: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, updatedAt), content: id, ...overrides };
}

describe('createExport', () => {
  it('wraps the notes with the schema version and time', () => {
    const notes = [note('a', '2026-10-15T10:00:00.000Z')];

    expect(createExport(notes, NOW)).toEqual({ schemaVersion: 1, exportedAt: NOW.toISOString(), notes });
  });

  it('names the file by the local date', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 30))).toBe('tapnote-2026-01-05.json');
  });
});

describe('parseExport', () => {
  const valid = createExport([note('a', '2026-10-15T10:00:00.000Z')], NOW);

  it('accepts a valid export', () => {
    expect(parseExport(JSON.stringify(valid))).toEqual({ ok: true, notes: valid.notes });
  });

  it('rejects invalid JSON', () => {
    expect(parseExport('{')).toEqual({ ok: false, error: 'json' });
  });

  it('rejects an export from a newer version', () => {
    expect(parseExport(JSON.stringify({ ...valid, schemaVersion: 2 }))).toEqual({ ok: false, error: 'version' });
  });

  it('normalizes dates to UTC and drops unknown fields', () => {
    const text = JSON.stringify({
      ...valid,
      notes: [{ ...valid.notes[0], updatedAt: '2026-10-19T14:00:00+02:00', deletedAt: '2026-10-19T14:00:00+02:00', extra: 1 }],
    });

    const parsed = parseExport(text);

    expect(parsed).toEqual({
      ok: true,
      notes: [{ ...valid.notes[0], updatedAt: '2026-10-19T12:00:00.000Z', deletedAt: '2026-10-19T12:00:00.000Z' }],
    });
  });

  it.each([
    ['null'],
    ['[]'],
    ['{}'],
    [JSON.stringify({ ...valid, notes: [{ id: 'x' }] })],
    [JSON.stringify({ ...valid, notes: [{ ...valid.notes[0], updatedAt: 'zzz' }] })],
    [JSON.stringify({ ...valid, notes: [{ ...valid.notes[0], createdAt: '' }] })],
    [JSON.stringify({ ...valid, notes: [{ ...valid.notes[0], deletedAt: 'x' }] })],
  ])('rejects %s', (text) => {
    expect(parseExport(text)).toEqual({ ok: false, error: 'format' });
  });
});

describe('mergeNotes', () => {
  it('adds new notes and newer versions only', () => {
    const existing = [note('same', '2026-10-15T10:00:00.000Z'), note('old', '2026-10-15T10:00:00.000Z'), note('mine', '2026-10-16T10:00:00.000Z')];
    const incoming = [
      note('same', '2026-10-15T10:00:00.000Z'),
      note('old', '2026-10-16T10:00:00.000Z'),
      note('mine', '2026-10-15T10:00:00.000Z'),
      note('new', '2026-10-15T10:00:00.000Z'),
    ];

    expect(mergeNotes(existing, incoming).map((item) => item.id)).toEqual(['old', 'new']);
  });

  it('keeps the newest of duplicate ids in the import', () => {
    const merged = mergeNotes([], [note('a', '2026-10-15T10:00:00.000Z'), note('a', '2026-10-17T10:00:00.000Z', { content: 'newer' }), note('a', '2026-10-16T10:00:00.000Z')]);

    expect(merged.map((item) => item.content)).toEqual(['newer']);
  });
});

describe('last backup', () => {
  beforeEach(() => localStorage.clear());

  it('is stored as ISO time', () => {
    expect(readLastBackup()).toBeUndefined();

    writeLastBackup(NOW);

    expect(localStorage.getItem(LAST_BACKUP_KEY)).toBe(NOW.toISOString());
    expect(readLastBackup()).toBe(NOW.toISOString());
  });
});

describe('daysWithoutBackup', () => {
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it('is undefined without notes', () => {
    expect(daysWithoutBackup(undefined, [], NOW)).toBeUndefined();
    expect(daysWithoutBackup(undefined, [note('a', daysAgo(30), { deletedAt: daysAgo(1) })], NOW)).toBeUndefined();
  });

  it('counts from the oldest note when never backed up', () => {
    expect(daysWithoutBackup(undefined, [note('a', daysAgo(6)), note('b', daysAgo(1))], NOW)).toBeUndefined();
    expect(daysWithoutBackup(undefined, [note('a', daysAgo(9)), note('b', daysAgo(1))], NOW)).toBe(9);
  });

  it('counts from the last backup', () => {
    const notes = [note('a', daysAgo(30))];

    expect(daysWithoutBackup(daysAgo(6), notes, NOW)).toBeUndefined();
    expect(daysWithoutBackup(daysAgo(7), notes, NOW)).toBe(7);
  });
});
