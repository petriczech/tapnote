import { TestBed } from '@angular/core/testing';
import { createNote, Note } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { LAST_EDIT_KEY, NoteDraft, RESUME_WINDOW_MS, SAVE_DEBOUNCE_MS } from './note-draft';

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
      providers: [NoteDraft, { provide: NotesRepository, useValue: repository }],
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
});
