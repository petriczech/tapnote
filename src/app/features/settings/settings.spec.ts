import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { createExport, LAST_BACKUP_KEY } from '../../core/backup/notes-backup';
import { createNote, Note } from '../../core/model/note';
import { createTask, Task } from '../../core/model/task';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { SHORTCUTS_KEY } from '../../core/shortcuts/shortcuts';
import { THEME_KEY } from '../../core/theme/theme';
import { MAX_IMPORT_BYTES, Settings } from './settings';
import { VersionsRepository } from '../../core/storage/versions-repository';
import { InMemoryVersionsRepository } from '../../core/storage/testing/in-memory-versions-repository';

function note(id: string, updatedAt: string, content = id): Note {
  return { ...createNote(id, updatedAt), content };
}

const backupOf = (notes: Note[], tasks: Task[] = []) => JSON.stringify(createExport({ notes, tasks, categories: [] }, new Date()));

describe('Settings', () => {
  let repository: InMemoryNotesRepository;
  let tasks: InMemoryTasksRepository;
  let fixture: ComponentFixture<Settings>;
  let root: HTMLElement;

  const button = (text: string) =>
    [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === text) as HTMLButtonElement;
  const status = () => root.querySelector(':scope > [aria-live="polite"]')?.textContent?.trim();
  const radio = (value: string) => root.querySelector<HTMLInputElement>(`input[value="${value}"]`) as HTMLInputElement;

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Settings);
    root = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function chooseFile(content: string): Promise<void> {
    const input = root.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    const file = new File([content], 'zaloha.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(status()).not.toBe(''));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    localStorage.removeItem(LAST_BACKUP_KEY);
    repository = new InMemoryNotesRepository();
    tasks = new InMemoryTasksRepository();
    await repository.bulkPut([note('a', '2026-10-15T10:00:00.000Z'), note('b', '2026-10-16T10:00:00.000Z')]);
    TestBed.configureTestingModule({
      imports: [Settings],
      providers: [
        provideRouter([]),
        { provide: NotesRepository, useValue: repository }, { provide: VersionsRepository, useClass: InMemoryVersionsRepository },
        { provide: TasksRepository, useValue: tasks },
        { provide: CategoriesRepository, useClass: InMemoryCategoriesRepository },
      ],
    });
  });

  // jsdom URL.createObjectURL nemá, náhrada se po testu vrací
  const { createObjectURL, revokeObjectURL } = URL;

  afterEach(() => {
    localStorage.removeItem(LAST_BACKUP_KEY);
    localStorage.removeItem(SHORTCUTS_KEY);
    vi.restoreAllMocks();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
  });

  it('marks Nastavení as the current item in the bottom navigation', async () => {
    await render();

    const current = root.querySelector('nav[aria-label="Pohledy"] [aria-current="page"]');
    expect(current?.textContent?.trim()).toBe('Nastavení');
    expect(current?.getAttribute('href')).toBe('/settings');
  });

  describe('templates', () => {
    beforeEach(async () => {
      await repository.put({ ...note('tpl', '2026-10-15T10:00:00.000Z'), title: 'Porada', isTemplate: true });
    });

    const rowButton = (label: string) => root.querySelector<HTMLButtonElement>(`.templates button[aria-label="${label}"]`) as HTMLButtonElement;

    it('lists templates with a link to edit them', async () => {
      await render();
      await vi.waitFor(() => expect(root.querySelector('.template-title')?.textContent?.trim()).toBe('Porada'));

      expect(root.querySelector('.template-title')?.getAttribute('href')).toBe('/note/tpl');
      expect(root.querySelectorAll('.templates li').length).toBe(1);
    });

    it('turns a template back into a note', async () => {
      await render();
      await vi.waitFor(() => expect(rowButton('Vrátit mezi poznámky: Porada')).not.toBeNull());

      rowButton('Vrátit mezi poznámky: Porada').click();

      await vi.waitFor(() => expect(status()).toBe('Šablona je zpět mezi poznámkami.'));
      expect(repository.notes.get('tpl')?.isTemplate).toBe(false);
      await vi.waitFor(() => expect(root.querySelector('.templates')).toBeNull());
      await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('#templates-heading')));
    });

    it('deletes a template after confirmation and focuses the next one', async () => {
      await repository.put({ ...note('tpl2', '2026-10-15T10:00:00.000Z'), title: 'Deník', isTemplate: true });
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await render();
      await vi.waitFor(() => expect(rowButton('Smazat: Deník')).not.toBeNull());

      rowButton('Smazat: Deník').click();

      await vi.waitFor(() => expect(status()).toBe('Šablona je smazaná.'));
      expect(repository.notes.has('tpl2')).toBe(false);
      await vi.waitFor(() => expect(document.activeElement?.textContent?.trim()).toBe('Porada'));
    });
  });

  it('explains how to create a template when there is none', async () => {
    await render();

    expect(root.textContent).toContain('Uložit jako šablonu');
    expect(root.textContent).toContain('{{date}}');
  });

  it('switches the theme', async () => {
    await render();
    expect(radio('konfety').checked).toBe(true);

    radio('graphite').click();
    await fixture.whenStable();

    expect(document.documentElement.dataset['theme']).toBe('graphite');
    expect(localStorage.getItem(THEME_KEY)).toBe('graphite');
    expect(radio('graphite').checked).toBe(true);

    radio('konfety').click();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    localStorage.removeItem(THEME_KEY);
  });

  it('downloads all notes and remembers the backup', async () => {
    const createUrl = vi.fn((file: File) => (void file, 'blob:zaloha'));
    URL.createObjectURL = createUrl as typeof URL.createObjectURL;
    const revokeUrl = vi.fn();
    URL.revokeObjectURL = revokeUrl;
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await render();
    expect(root.querySelector('.last-backup')?.textContent).toContain('zatím žádná');

    const timeout = vi.spyOn(window, 'setTimeout');
    button('Stáhnout zálohu').click();
    await vi.waitFor(() => expect(status()).toBe('Záloha je připravená.'));
    await fixture.whenStable();

    // URL se uvolní až po minutě
    expect(revokeUrl).not.toHaveBeenCalled();
    const revoke = timeout.mock.calls.find(([, delay]) => delay === 60_000)?.[0] as () => void;
    revoke();
    expect(revokeUrl).toHaveBeenCalledWith('blob:zaloha');

    expect(click).toHaveBeenCalledTimes(1);
    const file = createUrl.mock.calls[0][0];
    expect(file.name).toMatch(/^tapnote-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(await file.text());
    expect(exported.schemaVersion).toBe(2);
    expect(exported.tasks).toEqual([]);
    expect(exported.notes.map((item: Note) => item.id).sort()).toEqual(['a', 'b']);
    expect(localStorage.getItem(LAST_BACKUP_KEY)).not.toBeNull();
    expect(root.querySelector('.last-backup')?.textContent).not.toContain('zatím žádná');
  });

  it('merges newer and new notes by default', async () => {
    await render();
    expect(radio('merge').checked).toBe(true);

    await chooseFile(
      backupOf([note('a', '2026-10-17T10:00:00.000Z', 'a2'), note('b', '2026-10-01T10:00:00.000Z', 'b0'), note('c', '2026-10-15T10:00:00.000Z')]),
    );

    expect(status()).toBe('Přidáno nebo aktualizováno poznámek: 2');
    expect(repository.notes.get('a')?.content).toBe('a2');
    expect(repository.notes.get('b')?.content).toBe('b');
    expect(repository.notes.has('c')).toBe(true);
  });

  it('replaces all notes after confirmation', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    radio('replace').click();

    await chooseFile(backupOf([note('c', '2026-10-15T10:00:00.000Z')]));

    expect(confirm).toHaveBeenCalledWith('Smazat všechny současné poznámky (2) a nahradit je poznámkami ze zálohy (1)?');
    expect(status()).toBe('Obnoveno poznámek: 1');
    expect([...repository.notes.keys()]).toEqual(['c']);
  });

  it('restores tasks from the backup, mentions them and keeps categories missing in the backup', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();

    const categoriesBefore = [
      { id: 'c', name: 'Práce', icon: 'briefcase', color: 'blue' as const, order: 0, createdAt: '2026-10-15T10:00:00.000Z', updatedAt: '2026-10-15T10:00:00.000Z' },
    ];
    await TestBed.inject(CategoriesRepository).bulkPut(categoriesBefore);
    await TestBed.inject(VersionsRepository).add({ id: 'v', noteId: 'a', content: 'stará', createdAt: '2026-10-01T10:00:00.000Z' }, 20);
    await chooseFile(backupOf([], [createTask('t1', 'Zavolat', '2026-10-15T10:00:00.000Z')]));

    expect(status()).toBe('Přidáno nebo aktualizováno poznámek: 0, úkolů: 1');
    expect(tasks.tasks.has('t1')).toBe(true);

    radio('replace').click();
    await chooseFile(backupOf([note('c', '2026-10-15T10:00:00.000Z')], [createTask('t2', 'Nakoupit', '2026-10-15T10:00:00.000Z')]));

    expect(window.confirm).toHaveBeenCalledWith(
      'Smazat všechny současné poznámky (2) a úkoly (1) a nahradit je zálohou (poznámky 1, úkoly 1)?',
    );
    expect([...tasks.tasks.keys()]).toEqual(['t2']);
    expect(await TestBed.inject(VersionsRepository).getForNote('a')).toEqual([]);
    expect(await TestBed.inject(CategoriesRepository).getAll()).toEqual(categoriesBefore);
    expect(status()).toBe('Obnoveno poznámek: 1, úkolů: 1');
  });

  it('refuses to replace with an empty backup', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    await render();
    radio('replace').click();

    await chooseFile(backupOf([]));

    expect(confirm).not.toHaveBeenCalled();
    expect(status()).toBe('Záloha neobsahuje žádné poznámky.');
    expect(repository.notes.size).toBe(2);
  });

  it('keeps notes when replacing is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await render();
    radio('replace').click();

    const input = root.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    const backup = backupOf([note('c', '2026-10-15T10:00:00.000Z')]);
    Object.defineProperty(input, 'files', { value: [new File([backup], 'x.json')], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(window.confirm).toHaveBeenCalled());
    await fixture.whenStable();

    expect(repository.notes.size).toBe(2);
    expect(status()).toBe('');
  });

  it.each([
    ['{', 'Soubor není platná záloha Tapnote.'],
    [JSON.stringify({ schemaVersion: 3, exportedAt: '', notes: [] }), 'Záloha je z novější verze aplikace.'],
  ])('reports an invalid file %s', async (content, message) => {
    await render();

    await chooseFile(content);

    expect(status()).toBe(message);
    expect(root.querySelector(':scope > .status')?.classList).toContain('error');
    expect(repository.notes.size).toBe(2);
  });

  it('refuses a too large file', async () => {
    await render();
    const input = root.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'velka.json');
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 });
    const read = vi.spyOn(file, 'text');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(status()).toBe('Soubor je příliš velký.'));

    expect(read).not.toHaveBeenCalled();
    expect(repository.notes.size).toBe(2);
  });

  it('reports a failed import', async () => {
    vi.spyOn(repository, 'bulkPut').mockRejectedValue(new Error('fail'));
    await render();

    await chooseFile(backupOf([note('c', '2026-10-15T10:00:00.000Z')]));

    expect(status()).toBe('Zálohu se nepodařilo obnovit.');
  });

  it('turns keyboard shortcuts off and lists them', async () => {
    await render();
    const box = root.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(box.checked).toBe(true);
    expect(root.querySelectorAll('.shortcuts tbody tr').length).toBeGreaterThan(0);
    box.click();

    expect(localStorage.getItem(SHORTCUTS_KEY)).toBe('off');
  });
});
