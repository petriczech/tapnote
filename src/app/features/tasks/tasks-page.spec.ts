import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Category } from '../../core/model/category';
import { createTask, Task } from '../../core/model/task';
import { localDate } from '../../core/model/task-query';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { TasksPage } from './tasks-page';

const TODAY = localDate(new Date());

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { ...createTask(id, `Úkol ${id}`, `2026-10-1${id.length}T10:00:00.000Z`), ...overrides };
}

const work: Category = {
  id: 'work',
  name: 'Práce',
  icon: 'briefcase',
  color: 'blue',
  order: 0,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('TasksPage', () => {
  let repository: InMemoryTasksRepository;
  let fixture: ComponentFixture<TasksPage>;
  let root: HTMLElement;

  async function render(view?: string): Promise<void> {
    fixture = TestBed.createComponent(TasksPage);
    root = fixture.nativeElement;
    if (view) {
      fixture.componentRef.setInput('view', view);
    }
    await fixture.whenStable();
    await vi.waitFor(() => expect(root.querySelector('.tasks, .empty')).not.toBeNull());
  }

  const titles = (selector = '.tasks[aria-label="Úkoly"]') =>
    [...root.querySelectorAll(`${selector} .title`)].map((title) => title.textContent?.trim());
  const button = (text: string) =>
    [...root.querySelectorAll('button')].find((item) => item.textContent?.trim() === text) as HTMLButtonElement;

  async function type(title: string): Promise<void> {
    const input = root.querySelector<HTMLInputElement>('.add input') as HTMLInputElement;
    input.value = title;
    input.dispatchEvent(new Event('input'));
    root.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(input.value).toBe(''));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    repository = new InMemoryTasksRepository();
    const categories = new InMemoryCategoriesRepository();
    await categories.put(work);
    await repository.bulkPut([
      task('a', { myDay: TODAY }),
      task('bb', { important: true, categoryId: 'work', steps: [{ id: 's', title: 'krok', done: true }, { id: 't', title: 'krok', done: false }] }),
      task('ccc', { dueDate: TODAY, done: true, completedAt: '2026-10-19T10:00:00.000Z' }),
      task('dddd', { deletedAt: '2026-10-19T10:00:00.000Z' }),
    ]);
    TestBed.configureTestingModule({
      imports: [TasksPage],
      providers: [
        provideRouter([]),
        { provide: TasksRepository, useValue: repository },
        { provide: CategoriesRepository, useValue: categories },
      ],
    });
  });

  it('shows My day with progress, counts and the done section', async () => {
    await render();

    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Můj den');
    expect(titles()).toEqual(['Úkol a']);
    expect(root.querySelector('summary')?.textContent?.trim()).toBe('Hotové (1)');
    expect(root.querySelector('.ring')?.getAttribute('aria-label')).toBe('Hotovo 1 z 2');
    const counts = [...root.querySelectorAll('.views a')].map((link) => link.textContent?.replace(/\s+/g, ' ').trim());
    expect(counts).toEqual(['Můj den 1', 'Důležité 1', 'Naplánované 0', 'Vše 2']);
    expect(root.querySelector('nav[aria-label="Pohledy"] [aria-current="page"]')?.textContent?.trim()).toBe('Úkoly');
  });

  it('shows category, steps and importance in the row', async () => {
    await render('important');

    const row = root.querySelector('li[data-id="bb"]') as HTMLElement;
    expect([...row.querySelectorAll('.meta > span')].map((part) => part.textContent?.trim())).toEqual(['Práce', '1/2']);
    expect(row.style.getPropertyValue('--cat')).toBe('var(--c-blue)');
    expect(row.querySelector('.star')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('adds a task to My day and keeps the focus in the field', async () => {
    await render();
    const input = root.querySelector<HTMLInputElement>('.add input') as HTMLInputElement;
    input.focus();

    await type('Koupit mléko');

    const added = [...repository.tasks.values()].find((item) => item.title === 'Koupit mléko');
    expect(added).toMatchObject({ myDay: TODAY, done: false, important: false });
    expect(titles()).toContain('Koupit mléko');
    expect(document.activeElement).toBe(input);
  });

  it('focuses the quick-add field from the floating button', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    // jsdom scrollIntoView nemá, náhrada se po testu odstraní
    const scroll = vi.fn();
    HTMLElement.prototype.scrollIntoView = scroll;
    onTestFinished(() => {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    });
    await render();
    const input = root.querySelector<HTMLInputElement>('.add input') as HTMLInputElement;

    root.querySelector<HTMLButtonElement>('button.fab')?.click();

    expect(document.activeElement).toBe(input);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' });
  });

  it('applies the quick chips to the new task and resets them', async () => {
    await render('all');

    button('Zítra').click();
    button('Práce').click();
    button('Důležité').click();
    await fixture.whenStable();
    expect(root.querySelectorAll('.chip.set').length).toBe(3);

    await type('Poslat nabídku');

    const added = [...repository.tasks.values()].find((item) => item.title === 'Poslat nabídku');
    expect(added).toMatchObject({ important: true, categoryId: 'work' });
    expect(added?.dueDate).not.toBeUndefined();
    expect(added?.myDay).toBeUndefined();
    expect(root.querySelectorAll('.chip.set').length).toBe(0);
  });

  it.each([
    ['planned', { dueDate: TODAY, important: false }],
    ['important', { important: true }],
  ] as const)('adds a task with the defaults of the %s view', async (view, expected) => {
    await render(view);

    await type('Zaplatit nájem');

    const added = [...repository.tasks.values()].find((item) => item.title === 'Zaplatit nájem');
    expect(added).toMatchObject(expected);
    expect(added?.myDay).toBeUndefined();
  });

  it('moves the focus to the next open task after completing one', async () => {
    await repository.put(task('eeeee', { myDay: TODAY }));
    await render();
    const first = root.querySelector<HTMLInputElement>('li[data-id="eeeee"] .check') as HTMLInputElement;
    first.focus();

    first.click();
    await vi.waitFor(() => expect(repository.tasks.get('eeeee')?.done).toBe(true));
    await fixture.whenStable();

    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('li[data-id="a"] .check')));
    expect(root.querySelector('[aria-live="polite"]')?.textContent).toBe('Úkol Úkol eeeee hotov');
  });

  it('skips the task open in the detail beside the list and focuses the quick-add field', async () => {
    await repository.put(task('eeeee', { myDay: TODAY }));
    fixture = TestBed.createComponent(TasksPage);
    root = fixture.nativeElement;
    fixture.componentRef.setInput('pane', true);
    fixture.componentRef.setInput('openId', 'a');
    await fixture.whenStable();
    await vi.waitFor(() => expect(root.querySelector('li[data-id="eeeee"] .check')).not.toBeNull());
    const first = root.querySelector<HTMLInputElement>('li[data-id="eeeee"] .check') as HTMLInputElement;
    first.focus();

    first.click();
    await vi.waitFor(() => expect(repository.tasks.get('eeeee')?.done).toBe(true));
    await fixture.whenStable();

    expect(root.querySelector<HTMLInputElement>('li[data-id="a"] .check')?.disabled).toBe(true);
    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('.add input')));
  });

  it('filters by category and adds new tasks to the filtered category', async () => {
    fixture = TestBed.createComponent(TasksPage);
    root = fixture.nativeElement;
    fixture.componentRef.setInput('view', 'all');
    fixture.componentRef.setInput('category', 'work');
    await fixture.whenStable();
    await vi.waitFor(() => expect(root.querySelector('.tasks')).not.toBeNull());

    expect(titles()).toEqual(['Úkol bb']);
    expect(root.querySelector('.filters [aria-current]')?.textContent?.trim()).toBe('Práce');

    await type('Připravit poradu');

    expect([...repository.tasks.values()].find((item) => item.title === 'Připravit poradu')?.categoryId).toBe('work');
  });

  it('ignores an empty title', async () => {
    await render();

    await type('');

    expect(repository.tasks.size).toBe(4);
  });

  it('completes a task and moves it to the done section', async () => {
    await render();

    root.querySelector<HTMLInputElement>('li[data-id="a"] .check')?.click();
    await vi.waitFor(() => expect(repository.tasks.get('a')?.done).toBe(true));
    await fixture.whenStable();

    expect(repository.tasks.get('a')?.completedAt).toBeDefined();
    expect(titles()).toEqual([]);
    expect(root.querySelector('summary')?.textContent?.trim()).toBe('Hotové (2)');
  });

  it('unticks the checkbox and reports the error when saving fails', async () => {
    vi.spyOn(repository, 'update').mockRejectedValue(new Error('update failed'));
    await render();
    const check = root.querySelector<HTMLInputElement>('li[data-id="a"] .check') as HTMLInputElement;

    check.click();
    await vi.waitFor(() => expect(root.querySelector('.error')?.textContent?.trim()).toBe('Akci se nepodařilo dokončit.'));

    await vi.waitFor(() => expect(check.checked).toBe(false));
    expect(repository.tasks.get('a')?.done).toBe(false);
  });

  it('shows confetti briefly after completing a task', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    await render();

    root.querySelector<HTMLInputElement>('li[data-id="a"] .check')?.click();
    await vi.waitFor(() => expect(root.querySelector('tn-confetti')).not.toBeNull());
    expect(root.querySelector('tn-confetti')?.getAttribute('aria-hidden')).toBe('true');

    vi.advanceTimersByTime(800);
    await fixture.whenStable();
    expect(root.querySelector('tn-confetti')).toBeNull();
  });

  it('shows no confetti when reopening a done task', async () => {
    await render();
    root.querySelector('details')?.setAttribute('open', '');

    root.querySelector<HTMLInputElement>('li[data-id="ccc"] .check')?.click();
    await vi.waitFor(() => expect(repository.tasks.get('ccc')?.done).toBe(false));
    await fixture.whenStable();

    expect(root.querySelector('tn-confetti')).toBeNull();
  });

  it('shows grips only for open tasks outside the planned view', async () => {
    await repository.put(task('eeeee', { dueDate: TODAY }));
    await render('all');

    expect([...root.querySelectorAll('.grip')].map((grip) => grip.getAttribute('aria-label'))).toEqual([
      'Přesunout: Úkol eeeee',
      'Přesunout: Úkol bb',
      'Přesunout: Úkol a',
    ]);
    expect(root.querySelector('li[data-id="ccc"] .grip')).toBeNull();

    fixture.componentRef.setInput('view', 'planned');
    await fixture.whenStable();
    expect(titles()).toEqual(['Úkol eeeee']);
    expect(root.querySelector('.grip')).toBeNull();
  });

  it('moves a task from the grip menu and keeps the focus on its grip', async () => {
    await render('all');
    expect(titles()).toEqual(['Úkol bb', 'Úkol a']);

    root.querySelector<HTMLButtonElement>('li[data-id="a"] .grip')?.click();
    await fixture.whenStable();
    expect(button('Posunout dolů').getAttribute('aria-disabled')).toBe('true');
    button('Posunout na začátek').click();

    await vi.waitFor(() => expect(titles()).toEqual(['Úkol a', 'Úkol bb']));
    await vi.waitFor(() => expect(document.activeElement).toBe(root.querySelector('li[data-id="a"] .grip')));
    expect((repository.tasks.get('a')?.order ?? 0) < (repository.tasks.get('bb')?.order ?? 0)).toBe(true);
  });

  it('writes only the order, keeping a title saved meanwhile by the detail beside the list', async () => {
    await render('all');
    // Detail vedle seznamu uloží název až po načtení seznamu
    await repository.update('a', { title: 'Upraveno v detailu' });

    root.querySelector<HTMLButtonElement>('li[data-id="a"] .grip')?.click();
    await fixture.whenStable();
    button('Posunout nahoru').click();

    await vi.waitFor(() => expect(titles()).toEqual(['Upraveno v detailu', 'Úkol bb']));
    // Pořadí všech (i hotového ccc a smazaného dddd) od nejnovějšího: dddd, ccc, a, bb
    expect(repository.tasks.get('a')).toMatchObject({ title: 'Upraveno v detailu', order: 2 });
    expect([...repository.tasks.values()].map((item) => [item.id, item.order])).toEqual([
      ['a', 2],
      ['bb', 3],
      ['ccc', 1],
      ['dddd', 0],
    ]);
    // updatedAt jen u přesunutého úkolu, přečíslovaní sousedé ho nechají
    expect(repository.tasks.get('a')?.updatedAt).not.toBe('2026-10-11T10:00:00.000Z');
    expect(repository.tasks.get('bb')?.updatedAt).toBe('2026-10-12T10:00:00.000Z');
  });

  it('adds a new task at the top', async () => {
    await render('all');

    await type('Nový úkol');

    expect(titles()[0]).toBe('Nový úkol');
  });

  it('toggles importance', async () => {
    await render('all');

    root.querySelector<HTMLButtonElement>('li[data-id="a"] .star')?.click();

    await vi.waitFor(() => expect(repository.tasks.get('a')?.important).toBe(true));
  });
});
