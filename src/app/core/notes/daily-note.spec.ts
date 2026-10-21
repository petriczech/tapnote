import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { createNote } from '../model/note';
import { NotesRepository } from '../storage/notes-repository';
import { InMemoryNotesRepository } from '../storage/testing/in-memory-notes-repository';
import { DAILY_TAG, DailyNote, dailyTitle, openToday } from './daily-note';

@Component({ template: '' })
class Stub {}

const DAY = new Date(2026, 9, 21, 9, 30);

describe('DailyNote', () => {
  let repository: InMemoryNotesRepository;
  let daily: DailyNote;

  beforeEach(() => {
    repository = new InMemoryNotesRepository();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'today', children: [], canActivate: [openToday] },
          { path: 'note/:id', component: Stub },
          { path: 'new', component: Stub },
        ]),
        { provide: NotesRepository, useValue: repository },
      ],
    });
    daily = TestBed.inject(DailyNote);
  });

  it('names the note by the local date with a capital weekday', () => {
    expect(dailyTitle(DAY)).toBe('Středa 21. října 2026');
  });

  it('creates today’s note once and then reuses it', async () => {
    const id = await daily.open(DAY);

    expect(repository.notes.get(id)).toMatchObject({ title: 'Středa 21. října 2026', tags: [DAILY_TAG] });
    expect(repository.notes.get(id)?.content).toBe('Středa 21. října 2026\n#deník\n\n');
    expect(await daily.open(new Date(2026, 9, 21, 22, 0))).toBe(id);
    expect(repository.notes.size).toBe(1);
  });

  it('starts a new note on another day or when today’s is in the trash', async () => {
    const today = await daily.open(DAY);
    await repository.update(today, { deletedAt: '2026-10-21T10:00:00.000Z' });

    const again = await daily.open(DAY);
    const tomorrow = await daily.open(new Date(2026, 9, 22, 8, 0));

    expect(new Set([today, again, tomorrow]).size).toBe(3);
  });

  it('opens today’s note from /today and a new note when it fails', async () => {
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/today');
    const [note] = repository.notes.values();
    expect(router.url).toBe(`/note/${note.id}`);

    vi.spyOn(repository, 'getAll').mockRejectedValue(new Error('db'));
    await router.navigateByUrl('/today');
    expect(router.url).toBe('/new');
  });

  it('creates only one note for concurrent opens', async () => {
    const [first, second] = await Promise.all([daily.open(DAY), daily.open(DAY)]);

    expect(first).toBe(second);
    expect(repository.notes.size).toBe(1);
  });

  it('ignores a note with the same title but without the tag', async () => {
    await repository.put({ ...createNote('x', DAY.toISOString()), title: 'Středa 21. října 2026', content: 'Středa 21. října 2026' });

    expect(await daily.open(DAY)).not.toBe('x');
  });
});
