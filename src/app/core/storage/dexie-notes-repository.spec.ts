// Všechny repozitáře Dexie v jednom souboru: modul dexie si IndexedDB z fake-indexeddb přebírá jen jednou
import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { Dexie } from 'dexie';
import { Category } from '../model/category';
import { createNote as newNote, Note } from '../model/note';
import { createTask } from '../model/task';
import { CategoriesRepository } from './categories-repository';
import { DexieCategoriesRepository } from './dexie-categories-repository';
import { DexieNotesRepository } from './dexie-notes-repository';
import { DexieTasksRepository } from './dexie-tasks-repository';
import { NotesRepository } from './notes-repository';
import { TapnoteDb } from './tapnote-db';
import { TasksRepository } from './tasks-repository';
import { DexieVersionsRepository } from './dexie-versions-repository';
import { VersionsRepository } from './versions-repository';

function createNote(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: `Poznámka ${id}`,
    content: '',
    tags: [],
    pinned: false,
    archived: false,
    isTemplate: false,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
    ...overrides,
  };
}

describe('DexieNotesRepository', () => {
  let repository: NotesRepository;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: NotesRepository, useClass: DexieNotesRepository }],
    });
    repository = TestBed.inject(NotesRepository);
    await repository.replaceAll([]);
  });

  it('stores and loads a note', async () => {
    const note = createNote('1', { tags: ['a', 'b'], pinned: true, color: '#ff0' });

    await repository.put(note);

    expect(await repository.get('1')).toEqual(note);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await repository.get('missing')).toBeUndefined();
  });

  it('overwrites a note with the same id', async () => {
    await repository.put(createNote('1'));
    await repository.put(createNote('1', { content: 'nový obsah' }));

    const all = await repository.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].content).toBe('nový obsah');
  });

  it('returns the latest active note', async () => {
    await repository.bulkPut([
      createNote('old', { updatedAt: '2026-10-15T10:00:00.000Z' }),
      createNote('latest', { updatedAt: '2026-10-15T11:00:00.000Z' }),
      createNote('deleted', { updatedAt: '2026-10-15T12:00:00.000Z', deletedAt: '2026-10-15T12:00:00.000Z' }),
      createNote('archived', { updatedAt: '2026-10-15T13:00:00.000Z', archived: true }),
      createNote('template', { updatedAt: '2026-10-15T14:00:00.000Z', isTemplate: true }),
    ]);

    expect((await repository.getLatest())?.id).toBe('latest');
  });

  it('returns undefined as latest for an empty database', async () => {
    expect(await repository.getLatest()).toBeUndefined();
  });

  it('updates only the given fields', async () => {
    await repository.put(createNote('1', { content: 'obsah', deletedAt: '2026-10-15T11:00:00.000Z' }));

    await repository.update('1', { pinned: true, deletedAt: undefined });

    const note = await repository.get('1');
    expect(note).toMatchObject({ content: 'obsah', pinned: true });
    expect(note && 'deletedAt' in note).toBe(false);
  });

  it('purges notes deleted before a date', async () => {
    await repository.bulkPut([
      createNote('expired', { deletedAt: '2026-09-01T10:00:00.000Z' }),
      createNote('recent', { deletedAt: '2026-10-14T10:00:00.000Z' }),
      createNote('active'),
    ]);

    expect(await repository.purgeTrash('2026-10-01T00:00:00.000Z')).toBe(1);

    expect((await repository.getAll()).map((note) => note.id).sort()).toEqual(['active', 'recent']);
  });

  it('returns ids of notes deleted before a date', async () => {
    await repository.bulkPut([
      createNote('expired', { deletedAt: '2026-09-01T10:00:00.000Z' }),
      createNote('recent', { deletedAt: '2026-10-14T10:00:00.000Z' }),
      createNote('active'),
    ]);

    expect(await repository.getTrashedIdsBefore('2026-10-01T00:00:00.000Z')).toEqual(['expired']);
  });

  it('stores multiple notes at once', async () => {
    await repository.bulkPut([createNote('1'), createNote('2')]);

    expect((await repository.getAll()).map((note) => note.id).sort()).toEqual(['1', '2']);
  });

  it('deletes a note', async () => {
    await repository.bulkPut([createNote('1'), createNote('2')]);

    await repository.delete('1');

    expect((await repository.getAll()).map((note) => note.id)).toEqual(['2']);
  });

  it('replaces all notes', async () => {
    await repository.bulkPut([createNote('1'), createNote('2')]);

    await repository.replaceAll([createNote('3')]);

    expect((await repository.getAll()).map((note) => note.id)).toEqual(['3']);
  });

  it('keeps existing notes when replaceAll fails', async () => {
    await repository.put(createNote('1'));

    await expect(repository.replaceAll([createNote('2'), createNote('2')])).rejects.toThrow();

    expect((await repository.getAll()).map((note) => note.id)).toEqual(['1']);
  });
});

function category(id: string, order: number): Category {
  return { id, name: id, icon: 'home', color: 'green', order, createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z' };
}

describe('Dexie tasks and categories', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: TasksRepository, useClass: DexieTasksRepository },
        { provide: CategoriesRepository, useClass: DexieCategoriesRepository },
      ],
    });
  });

  afterEach(() => TestBed.inject(TapnoteDb).close());

  it('keeps notes when the version 1 database is upgraded', async () => {
    await Dexie.delete('tapnote');
    const old = new Dexie('tapnote');
    old.version(1).stores({ notes: 'id, updatedAt, deletedAt, *tags' });
    await old.table('notes').put(newNote('n', '2026-10-15T10:00:00.000Z'));
    old.close();

    const db = TestBed.inject(TapnoteDb);

    expect((await db.notes.toArray()).map((note) => note.id)).toEqual(['n']);
    expect(await db.tasks.count()).toBe(0);
  });

  it('stores, updates and purges tasks', async () => {
    const repository = TestBed.inject(TasksRepository);
    await repository.replaceAll([
      createTask('a', 'A', '2026-10-15T10:00:00.000Z'),
      { ...createTask('b', 'B', '2026-10-15T10:00:00.000Z'), deletedAt: '2026-10-01T10:00:00.000Z' },
    ]);

    await repository.update('a', { done: true, dueDate: '2026-10-20' });
    await repository.update('a', { dueDate: undefined });
    expect(await repository.purgeTrash('2026-10-10T00:00:00.000Z')).toBe(1);

    const [task] = await repository.getAll();
    expect(task.done).toBe(true);
    expect('dueDate' in task).toBe(false);
  });

  it('returns categories in their order', async () => {
    const repository = TestBed.inject(CategoriesRepository);
    await repository.replaceAll([category('b', 2), category('a', 1)]);
    await repository.put(category('c', 0));
    await repository.delete('b');

    expect((await repository.getAll()).map((item) => item.id)).toEqual(['c', 'a']);
  });
});

describe('Dexie versions', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: VersionsRepository, useClass: DexieVersionsRepository }] });
  });

  afterEach(() => TestBed.inject(TapnoteDb).close());

  it('keeps the newest versions per note and deletes them with the note', async () => {
    const repository = TestBed.inject(VersionsRepository);
    await repository.deleteForNotes(['a', 'b']);
    for (let i = 0; i < 4; i++) {
      await repository.add({ id: `a${i}`, noteId: 'a', content: `${i}`, createdAt: `2026-10-1${i}T10:00:00.000Z` }, 3);
    }
    await repository.add({ id: 'b0', noteId: 'b', content: 'b', createdAt: '2026-10-10T10:00:00.000Z' }, 3);

    expect((await repository.getForNote('a')).map((item) => item.id)).toEqual(['a3', 'a2', 'a1']);
    await repository.deleteForNotes(['a']);
    expect(await repository.getForNote('a')).toEqual([]);
    expect((await repository.getForNote('b')).length).toBe(1);
  });
});
