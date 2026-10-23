import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Category } from '../../core/model/category';
import { createNote } from '../../core/model/note';
import { createTask } from '../../core/model/task';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { routes } from '../../app.routes';
import { Categories } from './categories';

const NOW = '2026-10-21T09:00:00.000Z';
const category = (id: string, name: string, order: number): Category => ({
  id,
  name,
  icon: 'home',
  color: 'green',
  order,
  createdAt: NOW,
  updatedAt: NOW,
});

describe('Categories', () => {
  let categories: InMemoryCategoriesRepository;
  let tasks: InMemoryTasksRepository;
  let notes: InMemoryNotesRepository;
  let fixture: ComponentFixture<Categories>;
  let root: HTMLElement;

  // jsdom <dialog> neumí, showModal() a close() se proto podstrčí přes atribut open
  const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
  beforeAll(() => {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      if (this.hasAttribute('open')) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      }
    };
  });
  afterAll(() => {
    delete proto.showModal;
    delete proto.close;
  });

  const byLabel = (label: string) => root.querySelector<HTMLElement>(`[aria-label="${label}"]`) as HTMLElement;
  const button = (text: string, scope: ParentNode = root) =>
    [...scope.querySelectorAll('button')].find((item) => item.textContent?.trim() === text) as HTMLButtonElement;
  const dialog = () => root.querySelector('dialog') as HTMLDialogElement;
  const nameInput = () => dialog().querySelector<HTMLInputElement>('input:not([type])') as HTMLInputElement;
  const names = () => [...root.querySelectorAll('ul[aria-labelledby="mine-heading"] li .item-name')].map((item) => item.textContent?.trim());
  const status = () => root.querySelector('[aria-live="polite"]')?.textContent;

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(Categories);
    root = fixture.nativeElement;
    document.body.appendChild(root);
    // Načtení z repozitářů doběhne v mikroúlohách, na které whenStable nečeká
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  async function open(trigger: HTMLElement): Promise<void> {
    trigger.click();
    await fixture.whenStable();
    expect(dialog().open).toBe(true);
  }

  async function fill(name: string, icon: string, color: string): Promise<void> {
    nameInput().value = name;
    nameInput().dispatchEvent(new Event('input'));
    dialog().querySelector<HTMLInputElement>(`input[aria-label="${icon}"]`)?.click();
    dialog().querySelector<HTMLInputElement>(`input[aria-label="${color}"]`)?.click();
    button('Uložit', dialog()).click();
    await vi.waitFor(() => expect(dialog().open).toBe(false));
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.restoreAllMocks();
    root?.remove();
  });

  beforeEach(() => {
    categories = new InMemoryCategoriesRepository();
    tasks = new InMemoryTasksRepository();
    notes = new InMemoryNotesRepository();
    TestBed.configureTestingModule({
      imports: [Categories],
      providers: [
        provideRouter([]),
        { provide: CategoriesRepository, useValue: categories },
        { provide: TasksRepository, useValue: tasks },
        { provide: NotesRepository, useValue: notes },
      ],
    });
  });

  it('shows the breadcrumb, focuses the title and marks Nastavení in the bottom nav', async () => {
    await render();

    const crumb = root.querySelector('.crumbs');
    expect(crumb?.textContent?.trim()).toBe('Nastavení');
    expect(crumb?.getAttribute('href')).toBe('/settings');
    expect(document.activeElement).toBe(root.querySelector('h1'));
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Kategorie');
    expect(root.querySelector('nav[aria-label="Pohledy"] [aria-current="page"]')?.textContent?.trim()).toBe('Nastavení');
  });

  it('is the lazy route /settings/kategorie', async () => {
    TestBed.inject(Router).resetConfig(routes);
    const harness = await RouterTestingHarness.create();

    const page = await harness.navigateByUrl('/settings/kategorie', Categories);

    expect(page).toBeInstanceOf(Categories);
  });

  it('counts tasks and notes outside the trash, without templates, per category', async () => {
    await categories.bulkPut([category('prace', 'Práce', 0), category('domov', 'Domov', 1)]);
    await tasks.bulkPut([
      { ...createTask('t1', 'Nabídka', NOW), categoryId: 'prace' },
      { ...createTask('t2', 'Hotovo', NOW), categoryId: 'prace', done: true },
      { ...createTask('t3', 'V koši', NOW), categoryId: 'prace', deletedAt: NOW },
      createTask('t4', 'Bez kategorie', NOW),
    ]);
    await notes.bulkPut([
      { ...createNote('n1', NOW), categoryId: 'prace', archived: true },
      { ...createNote('n2', NOW), categoryId: 'prace', deletedAt: NOW },
      { ...createNote('n3', NOW), categoryId: 'prace', isTemplate: true },
    ]);
    await render();

    expect(names()).toEqual(['Práce', 'Domov']);
    // Id popisu je podle pořadí řádku, id kategorie ze zálohy může obsahovat cokoli
    const count = (index: number) => root.querySelector(`#count-${index}`)?.textContent?.trim();
    expect(count(0)).toBe('Položek: 3');
    expect(count(1)).toBe('Položek: 0');
    expect(byLabel('Upravit: Práce').getAttribute('aria-describedby')).toBe('count-0');
  });

  it('adds a category in the sheet and focuses its row', async () => {
    await render();
    expect(root.textContent).toContain('Kategorie mají ikonu a barvu');

    await open(button('Přidat kategorii'));
    expect(dialog().querySelector('#sheet-title')?.textContent?.trim()).toBe('Nová kategorie');
    expect(dialog().getAttribute('aria-labelledby')).toBe('sheet-title');
    expect(document.activeElement).toBe(nameInput());
    expect(button('Smazat', dialog())).toBeUndefined();
    await fill('Nákup', 'Nákup', 'Zelená');

    expect(names()).toEqual(['Nákup']);
    expect((await categories.getAll())[0]).toMatchObject({ name: 'Nákup', icon: 'cart', color: 'green' });
    expect(document.activeElement).toBe(byLabel('Upravit: Nákup'));
    expect(status()).toBe('Kategorie je přidaná.');
  });

  it('keeps the icon and colour choices as named native radio groups', async () => {
    await render();
    await open(button('Přidat kategorii'));

    const groups = [...dialog().querySelectorAll('fieldset')].map((set) => [
      set.querySelector('legend')?.textContent?.trim(),
      new Set([...set.querySelectorAll<HTMLInputElement>('input[type="radio"]')].map((input) => input.name)),
    ]);
    expect(groups).toEqual([
      ['Ikona', new Set(['category-icon'])],
      ['Barva', new Set(['category-color'])],
    ]);
  });

  it('keeps the sheet open with an alert when saving fails', async () => {
    vi.spyOn(categories, 'put').mockRejectedValue(new Error('quota'));
    await render();
    await open(button('Přidat kategorii'));
    nameInput().value = 'Nákup';
    nameInput().dispatchEvent(new Event('input'));

    button('Uložit', dialog()).click();
    await vi.waitFor(() => expect(dialog().querySelector('[role="alert"]')?.textContent).toBe('Akci se nepodařilo dokončit.'));
    await fixture.whenStable();

    expect(dialog().open).toBe(true);
    expect(nameInput().value).toBe('Nákup');
  });

  it('keeps a sheet opened while an earlier save was still running', async () => {
    await categories.bulkPut([category('prace', 'Práce', 0)]);
    await render();
    await open(byLabel('Upravit: Práce'));
    nameInput().value = 'Kancelář';
    nameInput().dispatchEvent(new Event('input'));

    // Uložení běží, panel se mezitím zavře (Esc) a otevře se nový
    button('Uložit', dialog()).click();
    dialog().close();
    button('Přidat kategorii').click();
    await vi.waitFor(() => expect(names()).toEqual(['Kancelář']));
    await fixture.whenStable();

    expect(dialog().open).toBe(true);
    expect(dialog().querySelector('#sheet-title')?.textContent?.trim()).toBe('Nová kategorie');
  });

  it('does not save an empty name', async () => {
    await render();
    await open(button('Přidat kategorii'));

    button('Uložit', dialog()).click();
    await fixture.whenStable();

    expect(await categories.getAll()).toEqual([]);
    expect(dialog().open).toBe(true);
    expect(document.activeElement).toBe(nameInput());
  });

  describe('closing the sheet', () => {
    beforeEach(() => categories.bulkPut([category('prace', 'Práce', 0)]));

    it('closes on Esc and returns the focus to the row', async () => {
      await render();
      await open(byLabel('Upravit: Práce'));
      expect(dialog().querySelector('#sheet-title')?.textContent?.trim()).toBe('Upravit kategorii');
      expect(nameInput().value).toBe('Práce');

      // Esc: prohlížeč vyvolá cancel a dialog zavře (událost close)
      dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
      dialog().close();
      await fixture.whenStable();

      expect(dialog().open).toBe(false);
      expect(dialog().querySelector('form')).toBeNull();
      expect(document.activeElement).toBe(byLabel('Upravit: Práce'));
    });

    // Klepnutí mimo panel zavře prohlížeč sám a vyvolá stejnou událost close jako Esc (ověřeno v Playwrightu)
    it('declares closedby=any for a click outside the sheet', async () => {
      await render();

      expect(dialog().getAttribute('closedby')).toBe('any');
    });

    it('returns the focus to Přidat kategorii after cancelling a new one', async () => {
      await render();
      await open(button('Přidat kategorii'));

      button('Zrušit', dialog()).click();
      await fixture.whenStable();

      expect(dialog().open).toBe(false);
      expect(document.activeElement).toBe(button('Přidat kategorii'));
      expect(await categories.getAll()).toHaveLength(1);
    });
  });

  it('edits, reorders and deletes categories', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await open(button('Přidat kategorii'));
    await fill('Práce', 'Práce', 'Modrá');
    await open(button('Přidat kategorii'));
    await fill('Domov', 'Domov', 'Oranžová');

    byLabel('Posunout nahoru: Domov').click();
    await vi.waitFor(() => expect(names()).toEqual(['Domov', 'Práce']));
    await fixture.whenStable();
    expect(document.activeElement).toBe(byLabel('Posunout nahoru: Domov'));
    expect(byLabel('Posunout nahoru: Domov').getAttribute('aria-disabled')).toBe('true');

    await open(byLabel('Upravit: Práce'));
    await fill('Kancelář', 'Škola', 'Tyrkysová');
    expect(names()).toEqual(['Domov', 'Kancelář']);
    expect((await categories.getAll())[1]).toMatchObject({ name: 'Kancelář', icon: 'book', color: 'teal' });
    expect(document.activeElement).toBe(byLabel('Upravit: Kancelář'));
    expect(status()).toBe('Kategorie je uložená.');

    await open(byLabel('Upravit: Domov'));
    button('Smazat', dialog()).click();
    await vi.waitFor(() => expect(names()).toEqual(['Kancelář']));
    await fixture.whenStable();
    expect(confirm).toHaveBeenCalledWith('Smazat kategorii „Domov“? Úkoly a poznámky v ní zůstanou bez kategorie.');
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(root.querySelector('h1'));
    expect(status()).toBe('Kategorie je smazaná.');
  });

  it('keeps the category when the delete is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await categories.bulkPut([category('prace', 'Práce', 0)]);
    await render();
    await open(byLabel('Upravit: Práce'));

    button('Smazat', dialog()).click();
    await fixture.whenStable();

    expect(dialog().open).toBe(true);
    expect(await categories.getAll()).toHaveLength(1);
  });
});
