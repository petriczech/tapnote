import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { CategoriesSection } from './categories-section';

describe('CategoriesSection', () => {
  let categories: InMemoryCategoriesRepository;
  let fixture: ComponentFixture<CategoriesSection>;
  let root: HTMLElement;

  const button = (text: string) =>
    [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === text) as HTMLButtonElement;
  const names = () => [...root.querySelectorAll('.item-name')].map((item) => item.textContent?.trim());

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(CategoriesSection);
    root = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function fill(name: string, icon: string, color: string): Promise<void> {
    const input = root.querySelector<HTMLInputElement>('.form .name input') as HTMLInputElement;
    input.value = name;
    input.dispatchEvent(new Event('input'));
    root.querySelector<HTMLInputElement>(`input[aria-label="${icon}"]`)?.click();
    root.querySelector<HTMLInputElement>(`input[aria-label="${color}"]`)?.click();
    root.querySelector('.form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(root.querySelector('.form')).toBeNull());
    await fixture.whenStable();
  }

  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    categories = new InMemoryCategoriesRepository();
    TestBed.configureTestingModule({
      imports: [CategoriesSection],
      providers: [
        { provide: CategoriesRepository, useValue: categories },
        { provide: TasksRepository, useClass: InMemoryTasksRepository },
        { provide: NotesRepository, useClass: InMemoryNotesRepository },
      ],
    });
  });

  it('adds a category with an icon and color and focuses its edit button', async () => {
    await render();
    expect(root.textContent).toContain('Kategorie mají ikonu a barvu');

    button('Přidat kategorii').click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('.form .name input'));
    await fill('Nákup', 'Nákup', 'Zelená');

    expect(names()).toEqual(['Nákup']);
    expect((await categories.getAll())[0]).toMatchObject({ name: 'Nákup', icon: 'cart', color: 'green' });
    expect(document.activeElement).toBe(root.querySelector('button[aria-label="Upravit: Nákup"]'));
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toBe('Kategorie je přidaná.');
  });

  it('keeps the form and shows the error when saving fails', async () => {
    vi.spyOn(categories, 'put').mockRejectedValue(new Error('quota'));
    await render();
    button('Přidat kategorii').click();
    await fixture.whenStable();
    const input = root.querySelector<HTMLInputElement>('.form .name input') as HTMLInputElement;
    input.value = 'Nákup';
    input.dispatchEvent(new Event('input'));

    root.querySelector('.form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(root.querySelector('[aria-live="polite"]')?.textContent).toBe('Akci se nepodařilo dokončit.'));
    await fixture.whenStable();

    expect(root.querySelector<HTMLInputElement>('.form .name input')?.value).toBe('Nákup');
  });

  it('does not save an empty name', async () => {
    await render();
    button('Přidat kategorii').click();
    await fixture.whenStable();

    root.querySelector('.form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await fixture.whenStable();

    expect(await categories.getAll()).toEqual([]);
    expect(root.querySelector('.form')).not.toBeNull();
  });

  it('edits, reorders and deletes categories', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    button('Přidat kategorii').click();
    await fixture.whenStable();
    await fill('Práce', 'Práce', 'Modrá');
    button('Přidat kategorii').click();
    await fixture.whenStable();
    await fill('Domov', 'Domov', 'Oranžová');

    root.querySelector<HTMLButtonElement>('button[aria-label="Posunout nahoru: Domov"]')?.click();
    await vi.waitFor(() => expect(names()).toEqual(['Domov', 'Práce']));

    root.querySelector<HTMLButtonElement>('button[aria-label="Upravit: Práce"]')?.click();
    await fixture.whenStable();
    await fill('Kancelář', 'Škola', 'Tyrkysová');
    expect(names()).toEqual(['Domov', 'Kancelář']);

    root.querySelector<HTMLButtonElement>('button[aria-label="Upravit: Domov"]')?.click();
    await fixture.whenStable();
    button('Smazat').click();
    await vi.waitFor(() => expect(names()).toEqual(['Kancelář']));
    await fixture.whenStable();
    expect(document.activeElement).toBe(root.querySelector('#categories-heading'));
  });
});
