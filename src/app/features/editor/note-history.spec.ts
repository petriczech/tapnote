import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { createNote } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { InMemoryVersionsRepository } from '../../core/storage/testing/in-memory-versions-repository';
import { VersionsRepository } from '../../core/storage/versions-repository';
import { NoteHistory } from './note-history';

describe('NoteHistory', () => {
  let notes: InMemoryNotesRepository;
  let versions: InMemoryVersionsRepository;
  let fixture: ComponentFixture<NoteHistory>;
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(id: string): Promise<void> {
    fixture = TestBed.createComponent(NoteHistory);
    root = fixture.nativeElement;
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    notes = new InMemoryNotesRepository();
    versions = new InMemoryVersionsRepository();
    await notes.put({ ...createNote('n', '2026-10-15T10:00:00.000Z'), title: 'Nákup', content: 'Nákup\nmléko, chléb' });
    TestBed.configureTestingModule({
      imports: [NoteHistory],
      providers: [
        provideRouter([]),
        { provide: NotesRepository, useValue: notes },
        { provide: VersionsRepository, useValue: versions },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('lists versions from the newest and restores one', async () => {
    await versions.add({ id: 'v1', noteId: 'n', content: 'Nákup\nmléko', createdAt: '2026-10-14T10:00:00.000Z' }, 20);
    await versions.add({ id: 'v2', noteId: 'n', content: '\nNákup\nmléko, máslo', createdAt: '2026-10-15T09:00:00.000Z' }, 20);
    await render('n');
    await vi.waitFor(() => expect(root.querySelectorAll('li').length).toBe(2));

    expect([...root.querySelectorAll('summary')].map((item) => item.textContent?.trim())).toEqual(['Nákup', 'Nákup']);
    expect(root.querySelector('.content')?.textContent).toBe('\nNákup\nmléko, máslo');
    expect(document.activeElement).toBe(root.querySelector('h1'));

    [...root.querySelectorAll<HTMLButtonElement>('li .text-btn')][1].click();

    await vi.waitFor(() => expect(notes.notes.get('n')?.content).toBe('Nákup\nmléko'));
    expect(navigate).toHaveBeenCalledWith(['/note', 'n']);
    expect((await versions.getForNote('n'))[0].content).toBe('Nákup\nmléko, chléb');
  });

  it('explains an empty history', async () => {
    await render('n');

    await vi.waitFor(() => expect(root.textContent).toContain('Zatím žádné starší verze'));
  });

  it('returns to the list for an unknown note', async () => {
    await render('missing');

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/notes'], { replaceUrl: true }));
  });
});
