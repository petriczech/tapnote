import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { LAST_BACKUP_KEY } from '../../core/backup/notes-backup';
import { createNote, Note } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { NotesList, URL_DEBOUNCE_MS } from './notes-list';

function note(id: string, overrides: Partial<Note> = {}): Note {
  return { ...createNote(id, '2026-10-15T10:00:00.000Z'), title: `Poznámka ${id}`, ...overrides };
}

describe('NotesList', () => {
  let repository: InMemoryNotesRepository;
  let fixture: ComponentFixture<NotesList>;
  let root: HTMLElement;

  async function render(inputs: { view?: string; tag?: string; q?: string } = {}): Promise<void> {
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

    expect(root.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Tapnote – Poznámky');
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
    ['unknown', 'Tapnote – Poznámky', ['Poznámka new', 'Bez názvu', 'Poznámka old']],
  ])('shows the %s view', async (view, heading, expected) => {
    await render({ view });

    expect(root.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(heading);
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

    await vi.waitFor(() => expect(titles()[0]).toBe('Připnuto: Poznámka old'));
    expect([...root.querySelectorAll('h2')].map((label) => label.textContent)).toEqual(['Připnuté', 'Ostatní']);
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

  describe('templates', () => {
    const picker = () => [...root.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Ze šablony');

    it('saves a note as a template and offers it for a new note', async () => {
      await render();
      expect(picker()).toBeUndefined();

      menuButton('old', 'Uložit jako šablonu').click();

      await vi.waitFor(() => expect(titles()).toEqual(['Poznámka new', 'Bez názvu']));
      expect(repository.notes.get('old')?.isTemplate).toBe(true);
      expect(picker()).toBeDefined();
      const link = root.querySelector('#templates-menu a');
      expect(link?.textContent?.trim()).toBe('Poznámka old');
      expect(link?.getAttribute('href')).toBe('/new?template=old');
    });
  });

  describe('backup reminder', () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const reminder = () => root.querySelector('.backup')?.textContent?.replace(/\s+/g, ' ').trim();

    beforeEach(async () => {
      await repository.put(note('ancient', { createdAt: '2020-01-01T00:00:00.000Z' }));
    });

    afterEach(() => localStorage.removeItem(LAST_BACKUP_KEY));

    it('shows the days without a backup and links to the settings', async () => {
      localStorage.setItem(LAST_BACKUP_KEY, daysAgo(10));
      await render();

      expect(reminder()).toBe('Bez zálohy 10 dní Zálohovat');
      expect(root.querySelector('.backup a')?.getAttribute('href')).toBe('/settings');
    });

    it('is hidden after a recent backup and outside the notes view', async () => {
      localStorage.setItem(LAST_BACKUP_KEY, daysAgo(1));
      await render();
      expect(reminder()).toBeUndefined();

      localStorage.setItem(LAST_BACKUP_KEY, daysAgo(10));
      await render({ view: 'archive' });
      expect(reminder()).toBeUndefined();
    });
  });

  it('links to the settings', async () => {
    await render();

    const link = [...root.querySelectorAll('a')].find((item) => item.textContent?.trim() === 'Nastavení');
    expect(link?.getAttribute('href')).toBe('/settings');
  });

  describe('search', () => {
    const field = () => root.querySelector<HTMLInputElement>('input[type="search"]') as HTMLInputElement;
    const status = () => root.querySelector('[aria-live="polite"]')?.textContent?.trim();

    async function type(value: string): Promise<void> {
      field().value = value;
      field().dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('filters while typing and announces the count', async () => {
      await render();

      await type('mleko');

      expect(titles()).toEqual(['Poznámka old']);
      expect(status()).toBe('Nalezena 1 poznámka');
      await type('poznámka');
      expect(status()).toBe('Nalezeny 2 poznámky');
    });

    it('keeps relevance order without pinned sections', async () => {
      await render();
      menuButton('old', 'Připnout').click();
      await vi.waitFor(() => expect(root.querySelectorAll('h2').length).toBe(2));

      await type('poznámka');

      expect(root.querySelectorAll('h2').length).toBe(0);
      expect(root.querySelectorAll('ul.notes').length).toBe(1);
    });

    it('starts from the q parameter', async () => {
      await render({ q: 'mléko' });

      expect(field().value).toBe('mléko');
      expect(titles()).toEqual(['Poznámka old']);
    });

    it('writes the query to the URL after a pause', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      vi.useFakeTimers();

      try {
        field().value = 'ml';
        field().dispatchEvent(new Event('input'));
        field().value = 'mléko';
        field().dispatchEvent(new Event('input'));
        vi.advanceTimersByTime(URL_DEBOUNCE_MS - 1);
        expect(navigate).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
      } finally {
        vi.useRealTimers();
      }

      expect(navigate).toHaveBeenCalledTimes(1);
      expect(navigate.mock.calls[0][1]).toMatchObject({
        queryParams: { q: 'mléko' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    });

    it('saves a pending query to history when a note opens', async () => {
      await render();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const replaceState = vi.spyOn(TestBed.inject(Location), 'replaceState');
      vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
      vi.useFakeTimers();

      try {
        field().value = 'mléko';
        field().dispatchEvent(new Event('input'));
        root.querySelector<HTMLElement>('li[data-id="new"] a.body')?.click();
        vi.advanceTimersByTime(URL_DEBOUNCE_MS);
      } finally {
        vi.useRealTimers();
      }

      expect(replaceState).toHaveBeenCalledWith('/?q=ml%C3%A9ko');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('clears the query with Escape', async () => {
      await render();
      await type('mleko');

      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await fixture.whenStable();

      expect(field().value).toBe('');
      expect(titles()).toEqual(['Poznámka new', 'Bez názvu', 'Poznámka old']);
      expect(status()).toBe('');
    });

    it('searches only the current view and tag', async () => {
      await render({ view: 'trash' });
      await type('poznámka');
      expect(titles()).toEqual(['Poznámka trashed']);

      fixture.componentRef.setInput('view', undefined);
      fixture.componentRef.setInput('tag', 'práce');
      await fixture.whenStable();
      expect(titles()).toEqual(['Poznámka new']);
    });

    it('filters by a #tag in the query', async () => {
      await render();

      await type('#domov');

      expect(titles()).toEqual(['Poznámka old']);
    });

    it('shows an empty state for no match', async () => {
      await render();

      await type(' xyz ');

      expect(root.querySelector('.empty')?.textContent?.trim()).toBe('Nic nenalezeno pro „xyz“');
      expect(status()).toBe('Nalezeno 0 poznámek');
    });

    it('keeps the query in view and tag links', async () => {
      await render();

      await type('mléko');

      const archive = [...root.querySelectorAll('nav[aria-label="Pohledy"] a')].find((link) => link.textContent?.trim() === 'Archiv');
      expect(archive?.getAttribute('href')).toBe('/notes?view=archive&q=ml%C3%A9ko');
      expect(root.querySelector('nav[aria-label="Tagy"] a')?.getAttribute('href')).toBe('/notes?tag=domov&q=ml%C3%A9ko');
    });
  });

  it('reports a failed load', async () => {
    vi.spyOn(repository, 'getAll').mockRejectedValue(new Error('idb'));
    fixture = TestBed.createComponent(NotesList);
    root = fixture.nativeElement;
    await fixture.whenStable();

    await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toContain('nepodařilo'));
  });
});
