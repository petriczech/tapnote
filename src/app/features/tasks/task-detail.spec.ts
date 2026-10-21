import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Category } from '../../core/model/category';
import { createTask, Task } from '../../core/model/task';
import { localDate } from '../../core/model/task-query';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { TaskDetail } from './task-detail';

const home: Category = {
  id: 'home',
  name: 'Domov',
  icon: 'home',
  color: 'orange',
  order: 0,
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

describe('TaskDetail', () => {
  let repository: InMemoryTasksRepository;
  let fixture: ComponentFixture<TaskDetail>;
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;

  const stored = () => repository.tasks.get('t') as Task;

  async function render(id = 't'): Promise<void> {
    fixture = TestBed.createComponent(TaskDetail);
    root = fixture.nativeElement;
    fixture.componentRef.setInput('id', id);
    await fixture.whenStable();
  }

  async function change(selector: string, value: string): Promise<void> {
    const field = root.querySelector<HTMLInputElement>(selector) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  beforeEach(async () => {
    repository = new InMemoryTasksRepository();
    const categories = new InMemoryCategoriesRepository();
    await categories.put(home);
    await repository.put({ ...createTask('t', 'Zavolat instalatérovi', '2026-10-15T10:00:00.000Z'), steps: [{ id: 's', title: 'Najít číslo', done: false }] });
    TestBed.configureTestingModule({
      imports: [TaskDetail],
      providers: [
        provideRouter([]),
        { provide: TasksRepository, useValue: repository },
        { provide: CategoriesRepository, useValue: categories },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  async function typeText(selector: string, value: string): Promise<HTMLTextAreaElement> {
    const field = root.querySelector<HTMLTextAreaElement>(selector) as HTMLTextAreaElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    return field;
  }

  it('saves the title while typing and restores it when left empty', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector<HTMLTextAreaElement>('.title')?.value).toBe('Zavolat instalatérovi'));

    await typeText('.title', '  Zavolat zítra  ');
    await vi.waitFor(() => expect(stored().title).toBe('Zavolat zítra'));

    const title = await typeText('.title', '   ');
    title.dispatchEvent(new Event('blur'));
    await vi.waitFor(() => expect(title.value).toBe('Zavolat zítra'));
    expect(stored().title).toBe('Zavolat zítra');
  });

  it('saves a typed note when the page is hidden or the detail closes', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector('.note textarea')).not.toBeNull());

    await typeText('.note textarea', 'Kohoutek kape');
    window.dispatchEvent(new Event('pagehide'));
    await vi.waitFor(() => expect(stored().note).toBe('Kohoutek kape'));

    await typeText('.note textarea', 'Kohoutek kape, vzít klíč');
    fixture.destroy();
    await vi.waitFor(() => expect(stored().note).toBe('Kohoutek kape, vzít klíč'));
  });

  it('unticks the checkbox and reports the error when saving fails', async () => {
    vi.spyOn(repository, 'update').mockRejectedValue(new Error('update failed'));
    await render();
    await vi.waitFor(() => expect(root.querySelector('.head .check')).not.toBeNull());
    const check = root.querySelector<HTMLInputElement>('.head .check') as HTMLInputElement;

    check.click();
    await vi.waitFor(() => expect(root.querySelector('.status')?.textContent?.trim()).toBe('Změnu se nepodařilo uložit.'));

    await vi.waitFor(() => expect(check.checked).toBe(false));
    expect(stored().done).toBe(false);
  });

  it('does not lose a quick second change of the steps', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector('input[aria-label="Najít číslo"]')).not.toBeNull());

    root.querySelector<HTMLInputElement>('input[aria-label="Najít číslo"]')?.click();
    root.querySelector<HTMLButtonElement>('.star')?.click();
    root.querySelector<HTMLButtonElement>('.star')?.click();

    await vi.waitFor(() => expect(stored().steps[0].done).toBe(true));
    await vi.waitFor(() => expect(stored().important).toBe(false));
    expect(document.activeElement).toBe(root.querySelector('h1'));
  });

  it('adds, completes and removes steps', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector('.add-step')).not.toBeNull());

    const input = root.querySelector<HTMLInputElement>('.add-step input') as HTMLInputElement;
    input.value = 'Domluvit termín';
    root.querySelector('.add-step')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(stored().steps.map((step) => step.title)).toEqual(['Najít číslo', 'Domluvit termín']));
    expect(input.value).toBe('');

    await fixture.whenStable();
    root.querySelector<HTMLInputElement>('input[aria-label="Najít číslo"]')?.click();
    await vi.waitFor(() => expect(stored().steps[0].done).toBe(true));

    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('button[aria-label="Smazat krok: Najít číslo"]')?.click();
    await vi.waitFor(() => expect(stored().steps.map((step) => step.title)).toEqual(['Domluvit termín']));
  });

  it('sets My day, due date, category, note and importance', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector('.fields')).not.toBeNull());

    root.querySelector<HTMLButtonElement>('button.field')?.click();
    await vi.waitFor(() => expect(stored().myDay).toBe(localDate(new Date())));
    await fixture.whenStable();
    await change('input[type="date"]', '2026-11-02');
    await change('select', 'home');
    await typeText('.note textarea', 'Kohoutek v koupelně');
    root.querySelector<HTMLButtonElement>('.star')?.click();

    await vi.waitFor(() => expect(stored()).toMatchObject({ dueDate: '2026-11-02', categoryId: 'home', note: 'Kohoutek v koupelně', important: true }));
    await fixture.whenStable();
    expect(root.style.getPropertyValue('--cat')).toBe('var(--c-orange)');

    await change('input[type="date"]', '');
    await vi.waitFor(() => expect('dueDate' in stored()).toBe(false));
  });

  it('completes the task', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector('input[aria-label="Hotovo"]')).not.toBeNull());

    root.querySelector<HTMLInputElement>('input[aria-label="Hotovo"]')?.click();

    await vi.waitFor(() => expect(stored().done).toBe(true));
    expect(stored().completedAt).toBeDefined();
  });

  it('moves the task to the trash and returns to the list', async () => {
    await render();
    await vi.waitFor(() => expect(root.querySelector('.danger')).not.toBeNull());

    (root.querySelector('.danger') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(stored().deletedAt).toBeDefined());
    expect(navigate).toHaveBeenCalledWith(['/tasks']);
  });

  it('returns to the list for an unknown or trashed task', async () => {
    await render('missing');

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith(['/tasks'], { replaceUrl: true }));
  });
});
