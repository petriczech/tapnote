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

  it('toggles importance', async () => {
    await render('all');

    root.querySelector<HTMLButtonElement>('li[data-id="a"] .star')?.click();

    await vi.waitFor(() => expect(repository.tasks.get('a')?.important).toBe(true));
  });
});
