import { TestBed } from '@angular/core/testing';
import { createNote, Note } from '../../core/model/note';
import { VERSION_PAUSE_MS } from '../../core/model/note-version';
import { NotesRepository } from '../../core/storage/notes-repository';
import { FLUSH_EVENT } from '../../core/storage/flush-event';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { LAST_EDIT_KEY, NoteDraft, RESUME_WINDOW_MS, SAVE_DEBOUNCE_MS } from './note-draft';
import { VersionsRepository } from '../../core/storage/versions-repository';
import { InMemoryVersionsRepository } from '../../core/storage/testing/in-memory-versions-repository';

const NOW = new Date('2026-10-15T12:00:00.000Z');

function existingNote(id: string, content: string, updatedAt: Date): Note {
  return { ...createNote(id, updatedAt.toISOString()), content };
}

function markEdited(id: string, editedAt: Date): void {
  localStorage.setItem(LAST_EDIT_KEY, JSON.stringify({ id, editedAt: editedAt.toISOString() }));
}

const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('NoteDraft', () => {
  let repository: InMemoryNotesRepository;
  let draft: NoteDraft;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    localStorage.clear();
    repository = new InMemoryNotesRepository();
    TestBed.configureTestingModule({
      providers: [NoteDraft, { provide: NotesRepository, useValue: repository }, { provide: VersionsRepository, useClass: InMemoryVersionsRepository }],
    });
    draft = TestBed.inject(NoteDraft);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not create a note before typing', async () => {
    await draft.open(undefined, false);
    await draft.flush();

    expect(repository.notes.size).toBe(0);
  });

  it('does not create a note from whitespace only', async () => {
    draft.update('  \n ');
    await draft.flush();

    expect(repository.notes.size).toBe(0);
  });

  it('creates a note after the debounce', async () => {
    draft.update('# Nákup\nmléko');

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS - 1);
    expect(repository.notes.size).toBe(0);

    await vi.advanceTimersByTimeAsync(1);
    const [note] = repository.notes.values();
    expect(note.content).toBe('# Nákup\nmléko');
    expect(note.title).toBe('Nákup');
    expect(note.tags).toEqual([]);
    expect(note.createdAt).toBe(new Date(NOW.getTime() + SAVE_DEBOUNCE_MS).toISOString());
  });

  it('saves hashtags as tags', async () => {
    draft.update('Nákup #domov\nmléko #Domov #obchod');
    await draft.flush();

    const [note] = repository.notes.values();
    expect(note.tags).toEqual(['domov', 'obchod']);
  });

  it('keeps updating the same note', async () => {
    draft.update('a');
    await draft.flush();
    vi.setSystemTime(new Date(NOW.getTime() + 1000));
    draft.update('ab');
    await draft.flush();

    expect(repository.notes.size).toBe(1);
    const [note] = repository.notes.values();
    expect(note.content).toBe('ab');
    expect(note.updatedAt).toBe(new Date(NOW.getTime() + 1000).toISOString());
    expect(note.createdAt).toBe(NOW.toISOString());
  });

  it('saves typed text before the database closes', async () => {
    draft.update('rozepsáno');
    const pending: Promise<void>[] = [];

    dispatchEvent(new CustomEvent(FLUSH_EVENT, { detail: pending }));
    await Promise.all(pending);

    expect(pending).toHaveLength(1);
    expect([...repository.notes.values()].map((note) => note.content)).toEqual(['rozepsáno']);
  });

  it('creates only one note when flushes overlap', async () => {
    draft.update('a');
    const first = draft.flush();
    draft.update('ab');
    await Promise.all([first, draft.flush()]);

    expect(repository.notes.size).toBe(1);
  });

  it('deletes a note created here when it is emptied', async () => {
    draft.update('a');
    await draft.flush();
    draft.update('');
    await draft.flush();

    expect(repository.notes.size).toBe(0);
  });

  it('keeps an existing note when it is emptied', async () => {
    await repository.put(existingNote('1', 'obsah', NOW));
    await draft.open('1', false);

    draft.update('');
    await draft.flush();

    expect(repository.notes.get('1')?.content).toBe('');
  });

  it('opens a note by id', async () => {
    await repository.put(existingNote('1', 'obsah', NOW));

    await draft.open('1', false);

    expect(draft.content()).toBe('obsah');
  });

  it('resumes the note edited last within the window', async () => {
    await repository.put(existingNote('1', 'rozepsáno', ago(RESUME_WINDOW_MS)));
    markEdited('1', ago(RESUME_WINDOW_MS - 1000));

    await draft.open(undefined, true);
    draft.update('rozepsáno dál');
    await draft.flush();

    expect(repository.notes.size).toBe(1);
    expect(repository.notes.get('1')?.content).toBe('rozepsáno dál');
  });

  it('does not resume a note edited before the window', async () => {
    await repository.put(existingNote('1', 'staré', ago(RESUME_WINDOW_MS)));
    markEdited('1', ago(RESUME_WINDOW_MS));

    await draft.open(undefined, true);

    expect(draft.content()).toBe('');
  });

  it('does not resume a note only changed outside the editor', async () => {
    await repository.put(existingNote('1', 'připnutá', NOW));

    await draft.open(undefined, true);

    expect(draft.content()).toBe('');
  });

  it.each([
    ['in the trash', { deletedAt: NOW.toISOString() }],
    ['archived', { archived: true }],
    ['a template', { isTemplate: true }],
  ])('does not resume a note %s', async (_case, overrides) => {
    await repository.put({ ...existingNote('1', 'rozepsáno', NOW), ...overrides });
    markEdited('1', NOW);

    await draft.open(undefined, true);

    expect(draft.content()).toBe('');
  });

  it.each([
    ['from the future', () => markEdited('1', new Date(NOW.getTime() + 60_000))],
    ['that is invalid', () => localStorage.setItem(LAST_EDIT_KEY, '{nonsense')],
    ['of a wrong shape', () => localStorage.setItem(LAST_EDIT_KEY, JSON.stringify({ id: 1 }))],
  ])('ignores a pointer %s', async (_case, write) => {
    await repository.put(existingNote('1', 'rozepsáno', NOW));
    write();

    expect(await draft.open(undefined, true)).toBe(true);
    expect(draft.content()).toBe('');
  });

  it('does not resume when resume is off', async () => {
    await repository.put(existingNote('1', 'rozepsáno', NOW));
    markEdited('1', NOW);

    await draft.open(undefined, false);

    expect(draft.content()).toBe('');
  });

  it('keeps typed text when the resumable note loads later', async () => {
    await repository.put(existingNote('1', 'rozepsáno', NOW));
    markEdited('1', NOW);

    const opening = draft.open(undefined, true);
    draft.update('nové');
    await opening;
    await draft.flush();

    expect(draft.content()).toBe('nové');
    expect(repository.notes.get('1')?.content).toBe('rozepsáno');
    expect(repository.notes.size).toBe(2);
  });

  it('points to the last saved note', async () => {
    draft.update('a');
    await draft.flush();

    const [note] = repository.notes.values();
    expect(JSON.parse(localStorage.getItem(LAST_EDIT_KEY) ?? 'null')).toEqual({ id: note.id, editedAt: NOW.toISOString() });
  });

  it('clears the pointer when the note created here is deleted', async () => {
    draft.update('a');
    await draft.flush();
    draft.update('');
    await draft.flush();

    expect(localStorage.getItem(LAST_EDIT_KEY)).toBeNull();
  });

  it('is saved only after the content is written', async () => {
    expect(draft.saved()).toBe(true);
    draft.update('a');
    expect(draft.saved()).toBe(false);

    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
    expect(draft.saved()).toBe(true);

    repository.failPut = true;
    draft.update('ab');
    await draft.flush();
    expect(draft.saved()).toBe(false);
  });

  it('stays unsaved when typing during a write', async () => {
    const put = repository.put.bind(repository);
    vi.spyOn(repository, 'put').mockImplementationOnce((note) => {
      draft.update('ab');
      return put(note);
    });
    draft.update('a');
    await draft.flush();

    expect(repository.notes.values().next().value?.content).toBe('a');
    expect(draft.saved()).toBe(false);
  });

  describe('from a template', () => {
    beforeEach(async () => {
      await repository.put({ ...existingNote('tpl', '# Porada {{date}}\n{{cursor}}', ago(1000)), isTemplate: true });
    });

    it('fills in the template without saving it', async () => {
      const cursor = await draft.openTemplate('tpl');
      await draft.flush();

      expect(draft.content()).toBe('# Porada 15. 10. 2026\n');
      expect(cursor).toBe(draft.content().length);
      expect(draft.saved()).toBe(false);
      expect(repository.notes.size).toBe(1);
    });

    it('creates a normal note after an edit', async () => {
      await draft.openTemplate('tpl');
      draft.update(draft.content() + 'Jana');
      await draft.flush();

      const created = [...repository.notes.values()].find((note) => note.id !== 'tpl');
      expect(created).toMatchObject({ content: '# Porada 15. 10. 2026\nJana', title: 'Porada 15. 10. 2026', isTemplate: false });
      expect(repository.notes.get('tpl')?.content).toBe('# Porada {{date}}\n{{cursor}}');
    });

    it('gives the new note the template color', async () => {
      await repository.update('tpl', { color: 'yellow' });
      await draft.openTemplate('tpl');
      expect(draft.color()).toBe('yellow');

      draft.update(draft.content() + 'x');
      await draft.flush();

      const created = [...repository.notes.values()].find((note) => note.id !== 'tpl');
      expect(created?.color).toBe('yellow');
    });

    it('ignores a missing id or a normal note', async () => {
      await repository.put(existingNote('plain', 'text', ago(1000)));

      expect(await draft.openTemplate('missing')).toBeUndefined();
      expect(await draft.openTemplate('plain')).toBeUndefined();
      expect(draft.content()).toBe('');
    });

    it('keeps text typed before the template loads', async () => {
      draft.update('rychle');

      expect(await draft.openTemplate('tpl')).toBeUndefined();
      expect(draft.content()).toBe('rychle');
    });
  });

  describe('with a newer version saved elsewhere', () => {
    // Zápis jako ze synchronizace nebo jiné záložky
    async function saveElsewhere(note: Note | undefined, id = '1'): Promise<void> {
      if (note) {
        repository.notes.set(id, note);
      } else {
        repository.notes.delete(id);
      }
      repository.changes.next();
      await draft.flush();
    }

    beforeEach(async () => {
      await repository.put(existingNote('1', 'původní', ago(60_000)));
      await draft.open('1', false);
    });

    it('reloads the open note without unsaved changes', async () => {
      await saveElsewhere({ ...existingNote('1', 'odjinud', ago(1000)), color: 'blue' });

      expect(draft.content()).toBe('odjinud');
      expect(draft.color()).toBe('blue');
      expect(draft.stored()?.content).toBe('odjinud');

      draft.update('odjinud a tady');
      await draft.flush();
      expect(repository.notes.get('1')).toMatchObject({ content: 'odjinud a tady', color: 'blue' });
    });

    it('keeps typed text and saves it over the other version with its metadata and text in history', async () => {
      vi.setSystemTime(new Date(NOW.getTime() + VERSION_PAUSE_MS));
      draft.update('rozepsáno');
      repository.notes.set('1', { ...existingNote('1', 'odjinud', NOW), pinned: true, categoryId: 'work', color: 'blue' });
      repository.changes.next();
      await draft.flush();

      expect(draft.content()).toBe('rozepsáno');
      expect(repository.notes.get('1')).toMatchObject({ content: 'rozepsáno', pinned: true, categoryId: 'work', color: 'blue' });
      const versions = await TestBed.inject(VersionsRepository).getForNote('1');
      expect(versions.map((version) => [version.content, version.createdAt])).toEqual([['odjinud', NOW.toISOString()]]);
    });

    it('restores a note moved to the trash elsewhere while typing', async () => {
      draft.update('rozepsáno');
      repository.notes.set('1', { ...existingNote('1', 'původní', ago(1000)), deletedAt: ago(1000).toISOString(), pinned: true });
      repository.changes.next();
      await draft.flush();

      const note = repository.notes.get('1');
      expect(note).toMatchObject({ content: 'rozepsáno', pinned: true });
      expect(note && 'deletedAt' in note).toBe(false);
      expect(draft.removed()).toBe(false);
    });

    it('keeps the text from the other device in history even without a typing pause', async () => {
      draft.update('rozepsáno');
      repository.notes.set('1', existingNote('1', 'odjinud', ago(1000)));
      repository.changes.next();
      await draft.flush();

      const versions = await TestBed.inject(VersionsRepository).getForNote('1');
      expect(versions.map((version) => version.content)).toEqual(['odjinud']);
    });

    it('writes the restore from the trash even when the typed text matches', async () => {
      draft.update('stejné');
      repository.notes.set('1', { ...existingNote('1', 'stejné', ago(1000)), deletedAt: ago(1000).toISOString() });
      repository.changes.next();
      await draft.flush();

      const note = repository.notes.get('1');
      expect(note && 'deletedAt' in note).toBe(false);
      expect(note?.updatedAt).toBe(NOW.toISOString());
    });

    it('ignores its own save', async () => {
      draft.update('tady');
      await draft.flush();
      repository.changes.next();
      await draft.flush();

      expect(draft.content()).toBe('tady');
      expect(draft.removed()).toBe(false);
    });

    it('ignores an older version', async () => {
      await saveElsewhere(existingNote('1', 'starší', ago(120_000)));

      expect(draft.content()).toBe('původní');
    });

    it.each([
      ['moved to the trash', { ...existingNote('1', 'původní', ago(1000)), deletedAt: ago(1000).toISOString() }],
      ['deleted', undefined],
    ])('closes the note %s elsewhere', async (_, note) => {
      await saveElsewhere(note);

      expect(draft.removed()).toBe(true);
      expect(draft.noteId()).toBeUndefined();
      expect(draft.content()).toBe('');

      draft.update('nová');
      await draft.flush();
      expect(repository.notes.size).toBe(note ? 2 : 1);
      expect(repository.notes.get('1')).toEqual(note);
    });
  });

  it('keeps a note created here when it is emptied after another version arrived', async () => {
    draft.update('nová');
    await draft.flush();
    const [created] = repository.notes.values();
    repository.notes.set(created.id, { ...created, content: 'odjinud', updatedAt: new Date(NOW.getTime() + 1000).toISOString() });
    repository.changes.next();
    await draft.flush();
    expect(draft.content()).toBe('odjinud');

    draft.update('');
    await draft.flush();

    expect(repository.notes.get(created.id)?.content).toBe('');
  });

  it('applies an action after saving typed text and keeps it on the next save', async () => {
    await repository.put(existingNote('1', 'a', ago(1000)));
    await draft.open('1', false);
    draft.update('ab');

    await draft.change((note) => repository.update(note.id, { color: 'blue' }));
    expect(draft.color()).toBe('blue');
    expect(draft.stored()?.content).toBe('ab');

    draft.update('abc');
    await draft.flush();
    expect(repository.notes.get('1')).toMatchObject({ content: 'abc', color: 'blue' });
  });

  it('keeps saving after a failed action', async () => {
    await repository.put(existingNote('1', 'a', ago(1000)));
    await draft.open('1', false);

    await expect(draft.change(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    draft.update('ab');
    await draft.flush();

    expect(repository.notes.get('1')?.content).toBe('ab');
  });

  it('skips an action when the typed text could not be saved', async () => {
    await repository.put(existingNote('1', 'a', ago(1000)));
    await draft.open('1', false);
    repository.failPut = true;
    draft.update('ab');
    const action = vi.fn(() => Promise.resolve());

    await expect(draft.change(action)).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();

    repository.failPut = false;
    await draft.change(action);
    expect(action).toHaveBeenCalledOnce();
    expect(repository.notes.get('1')?.content).toBe('ab');
  });

  it('reports a failed save and recovers', async () => {
    repository.failPut = true;
    draft.update('a');
    await draft.flush();
    expect(draft.saveFailed()).toBe(true);

    repository.failPut = false;
    await draft.flush();
    expect(draft.saveFailed()).toBe(false);
    expect(repository.notes.size).toBe(1);
  });

  it('clears the failure when there is nothing left to save', async () => {
    repository.failPut = true;
    draft.update('a');
    await draft.flush();
    expect(draft.saveFailed()).toBe(true);

    draft.update('');
    await draft.flush();

    expect(draft.saveFailed()).toBe(false);
    expect(repository.notes.size).toBe(0);
  });

  it('reports a failed delete', async () => {
    draft.update('a');
    await draft.flush();
    repository.failDelete = true;

    draft.update('');
    await draft.flush();

    expect(draft.saveFailed()).toBe(true);
    expect(repository.notes.size).toBe(1);
  });

  it.each([
    ['a missing note', undefined],
    ['a note in the trash', '2026-10-15T11:00:00.000Z'],
  ])('refuses to open %s', async (_case, deletedAt) => {
    if (deletedAt) {
      await repository.put({ ...existingNote('1', 'v koši', NOW), deletedAt });
    }

    expect(await draft.open('1', false)).toBe(false);
    expect(draft.content()).toBe('');
    expect(draft.loading()).toBe(false);
  });

  it('is loading while a note opens by id', async () => {
    await repository.put(existingNote('1', 'obsah', NOW));

    const opening = draft.open('1', false);
    expect(draft.loading()).toBe(true);
    await opening;

    expect(draft.loading()).toBe(false);
  });

  it('refuses to open a note that fails to load', async () => {
    vi.spyOn(repository, 'get').mockRejectedValue(new Error('idb'));

    expect(await draft.open('1', false)).toBe(false);
    expect(draft.loading()).toBe(false);
  });

  it('starts empty when the resumable note fails to load', async () => {
    markEdited('1', NOW);
    vi.spyOn(repository, 'get').mockRejectedValue(new Error('idb'));

    expect(await draft.open(undefined, true)).toBe(true);
    expect(draft.content()).toBe('');
  });

  describe('version history', () => {
    const versionsOf = () => TestBed.inject(VersionsRepository).getForNote('v');

    it('keeps the previous text when editing after a pause', async () => {
      await repository.put(existingNote('v', 'Původní text', ago(VERSION_PAUSE_MS)));
      await draft.open('v', false);

      draft.update('Nový text');
      await draft.flush();

      expect((await versionsOf()).map((version) => [version.content, version.createdAt])).toEqual([
        ['Původní text', ago(VERSION_PAUSE_MS).toISOString()],
      ]);
    });

    it('does not keep a version while typing continues', async () => {
      await repository.put(existingNote('v', 'Původní text', ago(VERSION_PAUSE_MS - 1000)));
      markEdited('v', ago(VERSION_PAUSE_MS - 1000));
      await draft.open('v', false);

      draft.update('Nový text');
      await draft.flush();
      draft.update('Nový text a ještě');
      await draft.flush();

      expect(await versionsOf()).toEqual([]);
    });

    it('measures the pause from the last text edit, not from pinning', async () => {
      await repository.put({ ...existingNote('v', 'Původní text', ago(1000)), pinned: true });
      markEdited('v', ago(VERSION_PAUSE_MS));
      await draft.open('v', false);

      draft.update('Nový text');
      await draft.flush();

      expect((await versionsOf()).map((version) => version.content)).toEqual(['Původní text']);
    });

    it('measures the pause from the note when the last edit was in another note', async () => {
      await repository.put(existingNote('v', 'Původní text', ago(1000)));
      markEdited('other', ago(VERSION_PAUSE_MS));
      await draft.open('v', false);

      draft.update('Nový text');
      await draft.flush();

      expect(await versionsOf()).toEqual([]);
    });
  });
});
