import { TestBed } from '@angular/core/testing';
import { createNote } from '../model/note';
import { MAX_VERSIONS } from '../model/note-version';
import { NotesRepository } from '../storage/notes-repository';
import { InMemoryNotesRepository } from '../storage/testing/in-memory-notes-repository';
import { NoteActions, TRASH_RETENTION_MS } from './note-actions';
import { VersionsRepository } from '../storage/versions-repository';
import { InMemoryVersionsRepository } from '../storage/testing/in-memory-versions-repository';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const EARLIER = '2026-10-01T10:00:00.000Z';

describe('NoteActions', () => {
  let repository: InMemoryNotesRepository;
  let actions: NoteActions;

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW });
    repository = new InMemoryNotesRepository();
    await repository.put({ ...createNote('1', EARLIER), content: 'obsah' });
    TestBed.configureTestingModule({ providers: [{ provide: NotesRepository, useValue: repository }, { provide: VersionsRepository, useClass: InMemoryVersionsRepository }] });
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

  it('turns a note into a template and back', async () => {
    await actions.setArchived(stored()!, true);
    await actions.setTemplate(stored()!, true);
    expect(stored()).toMatchObject({ isTemplate: true, archived: false, updatedAt: NOW.toISOString() });

    await actions.setTemplate(stored()!, false);
    expect(stored()?.isTemplate).toBe(false);
  });

  it('sets and removes the color', async () => {
    await actions.setColor(stored()!, 'green');
    expect(stored()).toMatchObject({ color: 'green', updatedAt: NOW.toISOString() });

    await actions.setColor(stored()!, undefined);
    expect(stored() && 'color' in stored()!).toBe(false);
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

  describe('versions', () => {
    const versions = () => TestBed.inject(VersionsRepository);
    const version = (id: string, createdAt: string) => ({ id, noteId: '1', content: `verze ${id}`, createdAt });

    it('restores a version and keeps the current text as a new version', async () => {
      const older = '2026-09-01T10:00:00.000Z';
      await versions().add(version('a', older), MAX_VERSIONS);

      await actions.restoreVersion(stored()!, version('a', older));

      expect(stored()).toMatchObject({ content: 'verze a', title: 'verze a', updatedAt: NOW.toISOString() });
      expect((await versions().getForNote('1')).map((item) => [item.content, item.createdAt])).toEqual([
        ['obsah', EARLIER],
        ['verze a', older],
      ]);
    });

    it('keeps the stored text when the passed note is stale', async () => {
      const stale = stored()!;
      await repository.update('1', { content: 'dopsáno těsně předtím', updatedAt: NOW.toISOString() });

      await actions.restoreVersion(stale, version('a', EARLIER));

      expect((await versions().getForNote('1')).map((item) => item.content)).toEqual(['dopsáno těsně předtím']);
    });

    it('keeps at most the limit of versions', async () => {
      for (let i = 0; i < MAX_VERSIONS + 3; i++) {
        await versions().add(version(String(i), new Date(Date.parse(EARLIER) + i * 1000).toISOString()), MAX_VERSIONS);
      }

      const kept = await versions().getForNote('1');
      expect(kept.length).toBe(MAX_VERSIONS);
      expect(kept.at(-1)?.id).toBe('3');
    });

    it('deletes the versions with the note and with purged trash', async () => {
      await versions().add(version('a', EARLIER), MAX_VERSIONS);
      await repository.put({ ...createNote('2', EARLIER), deletedAt: new Date(NOW.getTime() - TRASH_RETENTION_MS - 1000).toISOString() });
      await versions().add({ ...version('b', EARLIER), noteId: '2' }, MAX_VERSIONS);

      await actions.purgeTrash();
      expect(await versions().getForNote('2')).toEqual([]);
      expect((await versions().getForNote('1')).length).toBe(1);

      await actions.deletePermanently(stored()!);
      expect(await versions().getForNote('1')).toEqual([]);
    });
  });
});
