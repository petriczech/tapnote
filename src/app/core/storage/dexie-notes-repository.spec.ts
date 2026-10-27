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
import { DexieOutboxRepository } from './dexie-outbox-repository';
import { OutboxRepository } from './outbox-repository';

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

  it('fills the task order when the version 3 database is upgraded', async () => {
    await Dexie.delete('tapnote');
    const old = new Dexie('tapnote');
    old.version(1).stores({ notes: 'id, updatedAt, deletedAt, *tags' });
    old.version(2).stores({ tasks: 'id, updatedAt, deletedAt, categoryId', categories: 'id, order' });
    old.version(3).stores({ versions: 'id, noteId, createdAt' });
    const legacy = (id: string, createdAt: string) => {
      const task: Partial<ReturnType<typeof createTask>> = createTask(id, id, createdAt);
      delete task.order;
      return task;
    };
    await old.table('tasks').bulkPut([
      legacy('a', '2026-10-15T10:00:00.000Z'),
      legacy('b', '2026-10-17T10:00:00.000Z'),
      { ...legacy('c', '2026-10-16T10:00:00.000Z'), done: true, deletedAt: '2026-10-18T10:00:00.000Z' },
    ]);
    old.close();

    const db = TestBed.inject(TapnoteDb);
    const tasks = await db.tasks.toArray();

    expect(db.verno).toBe(5);
    expect(tasks.map((task) => [task.id, task.order])).toEqual([
      ['a', 2],
      ['b', 0],
      ['c', 1],
    ]);
    expect(tasks.every((task) => task.updatedAt === task.createdAt)).toBe(true);
    // Upgrade do fronty nic nezařadí
    expect(await db.outbox.count()).toBe(0);
  });

  it('stores, updates and purges tasks', async () => {
    const repository = TestBed.inject(TasksRepository);
    await repository.replaceAll([
      createTask('a', 'A', '2026-10-15T10:00:00.000Z'),
      { ...createTask('b', 'B', '2026-10-15T10:00:00.000Z'), deletedAt: '2026-10-01T10:00:00.000Z' },
    ]);

    await repository.update('a', { done: true, dueDate: '2026-10-20' });
    await repository.update('a', { dueDate: undefined });
    await repository.bulkUpdate([
      { id: 'a', changes: { order: 5 } },
      { id: 'b', changes: { order: 6 } },
    ]);
    expect(await repository.purgeTrash('2026-10-10T00:00:00.000Z')).toBe(1);

    const [task] = await repository.getAll();
    expect(task.done).toBe(true);
    expect(task.order).toBe(5);
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

describe('Dexie outbox', () => {
  let db: TapnoteDb;
  let outbox: OutboxRepository;
  let notes: NotesRepository;
  let tasks: TasksRepository;
  let categories: CategoriesRepository;

  // Fronta jako „kolekce/id:operace“, seřazená
  const queued = async () => (await outbox.pending()).map((entry) => `${entry.collection}/${entry.id}:${entry.op}`).sort();

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: NotesRepository, useClass: DexieNotesRepository },
        { provide: TasksRepository, useClass: DexieTasksRepository },
        { provide: CategoriesRepository, useClass: DexieCategoriesRepository },
        { provide: VersionsRepository, useClass: DexieVersionsRepository },
        { provide: OutboxRepository, useClass: DexieOutboxRepository },
      ],
    });
    db = TestBed.inject(TapnoteDb);
    outbox = TestBed.inject(OutboxRepository);
    notes = TestBed.inject(NotesRepository);
    tasks = TestBed.inject(TasksRepository);
    categories = TestBed.inject(CategoriesRepository);
    await outbox.applyRemote(async () => {
      await notes.replaceAll([]);
      await tasks.replaceAll([]);
      await categories.replaceAll([]);
    });
    await outbox.clear();
  });

  afterEach(() => db.close());

  it('enqueues every note write path', async () => {
    await notes.put(createNote('a'));
    await notes.bulkPut([createNote('b'), createNote('c', { deletedAt: '2026-09-01T10:00:00.000Z' })]);
    expect(await queued()).toEqual(['notes/a:put', 'notes/b:put', 'notes/c:put']);

    await outbox.clear();
    // Měkké smazání a obnovení jsou update
    await notes.update('a', { deletedAt: '2026-10-15T10:00:00.000Z' });
    await notes.update('missing', { pinned: true });
    await notes.delete('b');
    await notes.purgeTrash('2026-10-01T00:00:00.000Z');
    expect(await queued()).toEqual(['notes/a:put', 'notes/b:delete', 'notes/c:delete']);

    await outbox.clear();
    // Import s nahrazením: odebrané záznamy se smažou, nové se uloží
    await notes.replaceAll([createNote('d')]);
    expect(await queued()).toEqual(['notes/a:delete', 'notes/d:put']);
  });

  it('enqueues task and category writes', async () => {
    await tasks.replaceAll([createTask('a', 'A', '2026-10-15T10:00:00.000Z'), createTask('b', 'B', '2026-10-15T10:00:00.000Z')]);
    await categories.replaceAll([category('x', 0)]);
    await outbox.clear();

    await tasks.update('a', { done: true });
    await tasks.bulkUpdate([{ id: 'b', changes: { order: 3 } }]);
    await tasks.put({ ...createTask('c', 'C', '2026-10-15T10:00:00.000Z'), deletedAt: '2026-09-01T10:00:00.000Z' });
    await tasks.purgeTrash('2026-10-01T00:00:00.000Z');
    await categories.bulkPut([category('y', 1)]);
    await categories.delete('x');

    expect(await queued()).toEqual(['categories/x:delete', 'categories/y:put', 'tasks/a:put', 'tasks/b:put', 'tasks/c:delete']);
  });

  it('keeps one entry per record with the latest operation', async () => {
    await notes.put(createNote('a'));
    const [first] = await outbox.pending();
    await notes.update('a', { pinned: true });
    await notes.delete('a');

    const entries = await outbox.pending();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ collection: 'notes', id: 'a', op: 'delete' });
    expect(entries[0].at > first.at).toBe(true);
  });

  it('uses one change time for all keys of a single write', async () => {
    await notes.bulkPut([createNote('a'), createNote('b'), createNote('c')]);

    expect(new Set((await outbox.pending()).map((entry) => entry.at)).size).toBe(1);
  });

  it('rejects and rolls back the write when the queue entry cannot be stored', async () => {
    db.close();
    // Middleware pod frontou, které zápis do fronty odmítne
    db.use({
      stack: 'dbcore',
      name: 'FailingOutbox',
      level: 1,
      create: (down) => ({
        ...down,
        table: (name) =>
          name === 'outbox'
            ? { ...down.table(name), mutate: () => Promise.resolve({ numFailures: 1, failures: { 0: new Error('outbox full') }, lastResult: undefined }) }
            : down.table(name),
      }),
    });
    await db.open();

    await expect(notes.put(createNote('x'))).rejects.toThrow('outbox full');

    expect(await notes.get('x')).toBeUndefined();
  });

  it('refuses to apply remote changes inside another transaction', async () => {
    await expect(db.transaction('rw', db.notes, () => outbox.applyRemote(async () => notes.put(createNote('x'))))).rejects.toThrow();

    expect(await notes.get('x')).toBeUndefined();
  });

  it('does not enqueue note history', async () => {
    await TestBed.inject(VersionsRepository).add({ id: 'v', noteId: 'a', content: '', createdAt: '2026-10-15T10:00:00.000Z' }, 3);

    expect(await outbox.pending()).toEqual([]);
  });

  it('removes only entries that did not change in the meantime', async () => {
    await notes.bulkPut([createNote('a'), createNote('b')]);
    const sent = await outbox.pending();
    // Novější úprava během odesílání
    await notes.update('b', { pinned: true });

    await outbox.remove(sent);

    expect(await queued()).toEqual(['notes/b:put']);
  });

  it('does not enqueue remote changes', async () => {
    await outbox.applyRemote(async () => {
      await notes.bulkPut([createNote('a')]);
      await tasks.put(createTask('t', 'T', '2026-10-15T10:00:00.000Z'));
      await categories.replaceAll([category('x', 0)]);
    });

    expect(await outbox.pending()).toEqual([]);
    expect((await notes.getAll()).map((note) => note.id)).toEqual(['a']);
    // Další místní zápis se do fronty zařadí
    await notes.update('a', { pinned: true });
    expect(await queued()).toEqual(['notes/a:put']);
  });

  it('rolls back the queue together with a failed write', async () => {
    await notes.put(createNote('1'));
    await outbox.clear();

    await expect(notes.replaceAll([createNote('2'), createNote('2')])).rejects.toThrow();

    expect(await outbox.pending()).toEqual([]);
  });

  it('reports the pending count', async () => {
    const counts: number[] = [];
    const subscription = outbox.count().subscribe((count) => counts.push(count));
    await vi.waitFor(() => expect(counts).toEqual([0]));

    await notes.put(createNote('a'));

    await vi.waitFor(() => expect(counts.at(-1)).toBe(1));
    subscription.unsubscribe();
  });

  it('keeps data and starts with an empty queue when the version 4 database is upgraded', async () => {
    db.close();
    await Dexie.delete('tapnote');
    const old = new Dexie('tapnote');
    old.version(1).stores({ notes: 'id, updatedAt, deletedAt, *tags' });
    old.version(2).stores({ tasks: 'id, updatedAt, deletedAt, categoryId', categories: 'id, order' });
    old.version(3).stores({ versions: 'id, noteId, createdAt' });
    old.version(4).stores({});
    await old.table('notes').put(createNote('n'));
    await old.table('tasks').put(createTask('t', 'T', '2026-10-15T10:00:00.000Z'));
    await old.table('categories').put(category('c', 0));
    await old.table('versions').put({ id: 'v', noteId: 'n', content: '', createdAt: '2026-10-15T10:00:00.000Z' });
    old.close();

    const upgraded = new TapnoteDb();

    expect(upgraded.verno).toBe(5);
    expect((await upgraded.notes.toArray()).map((note) => note.id)).toEqual(['n']);
    expect((await upgraded.tasks.toArray()).map((task) => task.id)).toEqual(['t']);
    expect((await upgraded.categories.toArray()).map((item) => item.id)).toEqual(['c']);
    expect(await upgraded.versions.count()).toBe(1);
    expect(await upgraded.outbox.count()).toBe(0);
    upgraded.close();
  });
});
