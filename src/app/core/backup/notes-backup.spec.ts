import { Category } from '../model/category';
import { createNote, Note } from '../model/note';
import { createTask, Task } from '../model/task';
import {
  createExport,
  daysWithoutBackup,
  exportFileName,
  LAST_BACKUP_KEY,
  mergeNewer,
  parseExport,
  readLastBackup,
  writeLastBackup,
} from './notes-backup';

const NOW = new Date('2026-10-19T12:00:00.000Z');

function note(id: string, updatedAt: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, updatedAt), content: id, ...overrides };
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { ...createTask(id, `Úkol ${id}`, '2026-10-15T10:00:00.000Z'), ...overrides };
}

const category: Category = {
  id: 'c1',
  name: 'Práce',
  icon: 'briefcase',
  color: 'blue',
  order: 0,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('createExport', () => {
  it('wraps the data with the schema version and time', () => {
    const data = { notes: [note('a', '2026-10-15T10:00:00.000Z')], tasks: [task('t')], categories: [category] };

    expect(createExport(data, NOW)).toEqual({ schemaVersion: 3, exportedAt: NOW.toISOString(), ...data });
  });

  it('names the file by the local date', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 30))).toBe('tapnote-2026-01-05.json');
  });
});

describe('parseExport', () => {
  const valid = createExport({ notes: [note('a', '2026-10-15T10:00:00.000Z')], tasks: [], categories: [] }, NOW);

  it('accepts a valid export', () => {
    expect(parseExport(JSON.stringify(valid))).toEqual({ ok: true, notes: valid.notes, tasks: [], categories: [] });
  });

  it('keeps tasks with their order and categories', () => {
    const tasks = [task('t', { dueDate: '2026-10-20', steps: [{ id: 's', title: 'krok', done: true }], categoryId: 'c1', order: -2 })];
    const text = JSON.stringify({ ...valid, tasks, categories: [category] });

    expect(parseExport(text)).toEqual({ ok: true, notes: valid.notes, tasks, categories: [category] });
  });

  it('migrates a version 1 backup without tasks', () => {
    const text = JSON.stringify({ schemaVersion: 1, exportedAt: NOW.toISOString(), notes: valid.notes });

    expect(parseExport(text)).toEqual({ ok: true, notes: valid.notes, tasks: [], categories: [] });
  });

  it('fills the task order of a version 2 backup from the newest', () => {
    const old = [
      task('older', { createdAt: '2026-10-14T10:00:00.000Z' }),
      task('newest', { createdAt: '2026-10-16T12:00:00+02:00' }),
      task('middle'),
    ].map((item) => ({ ...item, order: undefined }));
    const text = JSON.stringify({ ...valid, schemaVersion: 2, tasks: old });

    const parsed = parseExport(text);

    expect(parsed.ok && parsed.tasks.map((item) => [item.id, item.order])).toEqual([
      ['older', 2],
      ['newest', 0],
      ['middle', 1],
    ]);
  });

  it('keeps a version 3 task without order (saved by an older app version in another tab)', () => {
    const text = JSON.stringify({ ...valid, tasks: [{ ...task('t'), order: undefined }] });

    const parsed = parseExport(text);

    expect(parsed.ok && parsed.tasks.map((item) => 'order' in item)).toEqual([false]);
  });

  it('keeps an order already present in a version 2 backup', () => {
    const text = JSON.stringify({ ...valid, schemaVersion: 2, tasks: [task('t', { order: -3 })] });

    const parsed = parseExport(text);

    expect(parsed.ok && parsed.tasks[0].order).toBe(-3);
  });

  it('rejects invalid JSON', () => {
    expect(parseExport('{')).toEqual({ ok: false, error: 'json' });
  });

  it('rejects an export from a newer version', () => {
    expect(parseExport(JSON.stringify({ ...valid, schemaVersion: 4 }))).toEqual({ ok: false, error: 'version' });
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
      tasks: [],
      categories: [],
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
    [JSON.stringify({ ...valid, schemaVersion: 0 })],
    [JSON.stringify({ ...valid, tasks: undefined })],
    [JSON.stringify({ ...valid, tasks: [{ ...task('t'), done: 'ne' }] })],
    [JSON.stringify({ ...valid, tasks: [task('t', { dueDate: '20. 10.' })] })],
    [JSON.stringify({ ...valid, tasks: [task('t', { myDay: '2026-13-45' })] })],
    [JSON.stringify({ ...valid, tasks: [{ ...task('t'), order: '1' }] })],
    [JSON.stringify({ ...valid, schemaVersion: 2, tasks: [{ ...task('t'), done: 'ne' }] })],
    [JSON.stringify({ ...valid, categories: [{ ...category, color: 'neon' }] })],
  ])('rejects %s', (text) => {
    expect(parseExport(text)).toEqual({ ok: false, error: 'format' });
  });
});

describe('mergeNewer', () => {
  it('adds new notes and newer versions only', () => {
    const existing = [note('same', '2026-10-15T10:00:00.000Z'), note('old', '2026-10-15T10:00:00.000Z'), note('mine', '2026-10-16T10:00:00.000Z')];
    const incoming = [
      note('same', '2026-10-15T10:00:00.000Z'),
      note('old', '2026-10-16T10:00:00.000Z'),
      note('mine', '2026-10-15T10:00:00.000Z'),
      note('new', '2026-10-15T10:00:00.000Z'),
    ];

    expect(mergeNewer(existing, incoming).map((item) => item.id)).toEqual(['old', 'new']);
  });

  it('keeps the newest of duplicate ids in the import', () => {
    const merged = mergeNewer([], [note('a', '2026-10-15T10:00:00.000Z'), note('a', '2026-10-17T10:00:00.000Z', { content: 'newer' }), note('a', '2026-10-16T10:00:00.000Z')]);

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
