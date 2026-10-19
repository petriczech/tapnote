import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createNote, Note } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { NotesList } from './notes-list';

function note(id: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, '2026-10-15T10:00:00.000Z'), title: `Poznámka ${id}`, ...overrides };
}

describe('NotesList', () => {
  let repository: InMemoryNotesRepository;
  let fixture: ComponentFixture<NotesList>;
  let root: HTMLElement;

  async function render(inputs: { view?: string; tag?: string } = {}): Promise<void> {
    fixture = TestBed.createComponent(NotesList);
    root = fixture.nativeElement;
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    await fixture.whenStable();
    await vi.waitFor(() => expect(root.querySelector('.notes, .empty')).not.toBeNull());
  }

  const titles = () => [...root.querySelectorAll('.title')].map((title) => title.textContent?.replace(/\s+/g, ' ').trim());

  function menuButton(id: string, text: string): HTMLButtonElement {
    const buttons = root.querySelectorAll<HTMLButtonElement>(`li[data-id="${id}"] .menu button`);
    return [...buttons].find((button) => button.textContent?.trim() === text) as HTMLButtonElement;
  }

  const actionsOf = (id: string) => root.querySelector(`li[data-id="${id}"] .actions`);

  beforeEach(async () => {
    repository = new InMemoryNotesRepository();
    await repository.bulkPut([
      note('old', { updatedAt: '2026-10-15T10:00:00.000Z', tags: ['domov'], content: 'Poznámka old\nmléko' }),
      note('new', { updatedAt: '2026-10-15T12:00:00.000Z', tags: ['práce'] }),
      note('untitled', { title: '', updatedAt: '2026-10-15T11:00:00.000Z' }),
      note('archived', { archived: true }),
      note('trashed', { deletedAt: '2026-10-14T10:00:00.000Z' }),
    ]);
    TestBed.configureTestingModule({
      imports: [NotesList],
      providers: [provideRouter([]), { provide: NotesRepository, useValue: repository }],
    });
  });

  it('lists active notes from the newest with a fallback title and snippet', async () => {
    await render();

    expect(root.querySelector('h1')?.textContent).toBe('Poznámky');
    expect(titles()).toEqual(['Poznámka new', 'Bez názvu', 'Poznámka old']);
    expect(root.querySelector('li[data-id="old"] .snippet')?.textContent).toBe('mléko');
    expect(root.querySelector('li[data-id="new"] a.body')?.getAttribute('href')).toBe('/note/new');
  });

  it('marks the current view and offers tag filters', async () => {
    await render();

    const current = root.querySelector('nav[aria-label="Pohledy"] [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Poznámky');
    const tags = [...root.querySelectorAll('nav[aria-label="Tagy"] a')].map((link) => link.textContent?.trim());
    expect(tags).toEqual(['#domov', '#práce']);
  });

  it('filters by tag', async () => {
    await render({ tag: 'domov' });

    expect(titles()).toEqual(['Poznámka old']);
    expect(root.querySelector('nav[aria-label="Tagy"] [aria-current="true"]')?.textContent?.trim()).toBe('#domov');
  });

  it.each([
    ['archive', 'Archiv', ['Poznámka archived']],
    ['trash', 'Koš', ['Poznámka trashed']],
    ['unknown', 'Poznámky', ['Poznámka new', 'Bez názvu', 'Poznámka old']],
  ])('shows the %s view', async (view, heading, expected) => {
    await render({ view });

    expect(root.querySelector('h1')?.textContent).toBe(heading);
    expect(titles()).toEqual(expected);
  });

  it('does not link notes in the trash and explains the retention', async () => {
    await render({ view: 'trash' });

    expect(root.querySelector('li a.body')).toBeNull();
    expect(root.querySelector('.hint')?.textContent).toContain('30 dnech');
  });

  it('pins a note to the top and keeps focus on it', async () => {
    await render();

    menuButton('old', 'Připnout').click();

    await vi.waitFor(() => expect(titles()[0]).toBe('Připnuto: 📌 Poznámka old'));
    expect(repository.notes.get('old')?.pinned).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(actionsOf('old')));
  });

  it('moves a note to the trash and focuses the next one', async () => {
    await render();

    menuButton('new', 'Smazat').click();

    await vi.waitFor(() => expect(titles()).toEqual(['Bez názvu', 'Poznámka old']));
    expect(repository.notes.get('new')?.deletedAt).toBeDefined();
    await vi.waitFor(() => expect(document.activeElement).toBe(actionsOf('untitled')));
  });

  it('archives a note', async () => {
    await render();

    menuButton('old', 'Archivovat').click();

    await vi.waitFor(() => expect(repository.notes.get('old')?.archived).toBe(true));
  });

  it('focuses the heading when the last note leaves the view', async () => {
    await render({ view: 'archive' });

    menuButton('archived', 'Vrátit z archivu').click();

    await vi.waitFor(() => expect(root.querySelector('.empty')?.textContent).toBe('Archiv je prázdný'));
    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('h1')));
  });

  it('restores a note from the trash', async () => {
    await render({ view: 'trash' });

    menuButton('trashed', 'Obnovit').click();

    await vi.waitFor(() => expect(repository.notes.get('trashed')?.deletedAt).toBeUndefined());
  });

  it('deletes permanently only after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await render({ view: 'trash' });

    menuButton('trashed', 'Smazat trvale').click();
    await fixture.whenStable();
    expect(repository.notes.has('trashed')).toBe(true);

    menuButton('trashed', 'Smazat trvale').click();
    await vi.waitFor(() => expect(repository.notes.has('trashed')).toBe(false));
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('shows an empty state for a tag without notes', async () => {
    await render({ tag: 'nic' });

    expect(root.querySelector('.empty')?.textContent).toBe('Žádné poznámky s tagem #nic');
  });

  it('reports a failed action and keeps focus on the note', async () => {
    vi.spyOn(repository, 'update').mockRejectedValue(new Error('idb'));
    await render();

    menuButton('old', 'Smazat').click();

    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain('nepodařilo dokončit'));
    expect(titles()).toContain('Poznámka old');
    await vi.waitFor(() => expect(document.activeElement).toBe(actionsOf('old')));
  });

  it('announces a repeated failure with a new alert', async () => {
    vi.spyOn(repository, 'update').mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('idb')))),
    );
    await render();

    menuButton('old', 'Smazat').click();
    await vi.waitFor(() => expect(root.querySelector('.error')).not.toBeNull());
    const first = root.querySelector('.error');

    menuButton('old', 'Archivovat').click();
    await vi.waitFor(() => {
      const alert = root.querySelector('.error');
      expect(alert).not.toBeNull();
      expect(alert).not.toBe(first);
    });
  });

  it('hides the failure after switching the view', async () => {
    vi.spyOn(repository, 'update').mockRejectedValue(new Error('idb'));
    await render();
    menuButton('old', 'Smazat').click();
    await vi.waitFor(() => expect(root.querySelector('.error')).not.toBeNull());

    fixture.componentRef.setInput('view', 'archive');
    await fixture.whenStable();

    expect(root.querySelector('.error')).toBeNull();
  });

  it('reports a failed load', async () => {
    vi.spyOn(repository, 'getAll').mockRejectedValue(new Error('idb'));
    fixture = TestBed.createComponent(NotesList);
    root = fixture.nativeElement;
    await fixture.whenStable();

    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain('nepodařilo'));
  });
});
