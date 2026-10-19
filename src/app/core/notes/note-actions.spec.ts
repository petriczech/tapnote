import { TestBed } from '@angular/core/testing';
import { createNote } from '../model/note';
import { NotesRepository } from '../storage/notes-repository';
import { InMemoryNotesRepository } from '../storage/testing/in-memory-notes-repository';
import { NoteActions, TRASH_RETENTION_MS } from './note-actions';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const EARLIER = '2026-10-01T10:00:00.000Z';

describe('NoteActions', () => {
  let repository: InMemoryNotesRepository;
  let actions: NoteActions;

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW });
    repository = new InMemoryNotesRepository();
    await repository.put({ ...createNote('1', EARLIER), content: 'obsah' });
    TestBed.configureTestingModule({ providers: [{ provide: NotesRepository, useValue: repository }] });
    actions = TestBed.inject(NoteActions);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const stored = () => repository.notes.get('1');

  it('toggles the pin and bumps updatedAt', async () => {
    await actions.togglePin(stored()!);
    expect(stored()).toMatchObject({ pinned: true, content: 'obsah', updatedAt: NOW.toISOString() });

    await actions.togglePin(stored()!);
    expect(stored()?.pinned).toBe(false);
  });

  it('archives and unarchives', async () => {
    await actions.setArchived(stored()!, true);
    expect(stored()?.archived).toBe(true);

    await actions.setArchived(stored()!, false);
    expect(stored()?.archived).toBe(false);
  });

  it('moves to the trash and restores', async () => {
    await actions.trash(stored()!);
    expect(stored()?.deletedAt).toBe(NOW.toISOString());

    await actions.restore(stored()!);
    expect(stored() && 'deletedAt' in stored()!).toBe(false);
    expect(stored()?.updatedAt).toBe(NOW.toISOString());
  });

  it('deletes permanently', async () => {
    await actions.deletePermanently(stored()!);

    expect(stored()).toBeUndefined();
  });

  it('purges notes in the trash longer than the retention', async () => {
    const limit = NOW.getTime() - TRASH_RETENTION_MS;
    await repository.bulkPut([
      { ...createNote('expired', EARLIER), deletedAt: new Date(limit - 1).toISOString() },
      { ...createNote('kept', EARLIER), deletedAt: new Date(limit + 1).toISOString() },
    ]);

    expect(await actions.purgeTrash()).toBe(1);
    expect([...repository.notes.keys()].sort()).toEqual(['1', 'kept']);
  });
});
