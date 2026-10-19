import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { Note } from '../model/note';
import { DexieNotesRepository } from './dexie-notes-repository';
import { NotesRepository } from './notes-repository';

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
