import { TestBed } from '@angular/core/testing';
import { createNote } from '../model/note';
import { createTask } from '../model/task';
import { CategoriesRepository } from '../storage/categories-repository';
import { NotesRepository } from '../storage/notes-repository';
import { TasksRepository } from '../storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../storage/testing/in-memory-notes-repository';
import { InMemoryTasksRepository } from '../storage/testing/in-memory-tasks-repository';
import { CategoryActions } from './category-actions';

describe('CategoryActions', () => {
  let categories: InMemoryCategoriesRepository;
  let tasks: InMemoryTasksRepository;
  let notes: InMemoryNotesRepository;
  let actions: CategoryActions;

  beforeEach(() => {
    categories = new InMemoryCategoriesRepository();
    tasks = new InMemoryTasksRepository();
    notes = new InMemoryNotesRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: CategoriesRepository, useValue: categories },
        { provide: TasksRepository, useValue: tasks },
        { provide: NotesRepository, useValue: notes },
      ],
    });
    actions = TestBed.inject(CategoryActions);
  });

  const names = async () => (await categories.getAll()).map((item) => item.name);

  it('adds categories at the end with a trimmed name', async () => {
    await actions.add({ name: ' Práce ', icon: 'briefcase', color: 'blue' });
    const home = await actions.add({ name: 'Domov', icon: 'home', color: 'orange' });

    expect(await names()).toEqual(['Práce', 'Domov']);
    expect(home.order).toBe(1);
  });

  it('updates and reorders categories', async () => {
    const work = await actions.add({ name: 'Práce', icon: 'briefcase', color: 'blue' });
    await actions.add({ name: 'Domov', icon: 'home', color: 'orange' });

    await actions.update(work, { name: 'Kancelář', icon: 'book', color: 'teal' });
    await actions.move((await categories.getAll())[0], 1);

    expect(await names()).toEqual(['Domov', 'Kancelář']);
    expect((await categories.getAll())[1]).toMatchObject({ icon: 'book', color: 'teal' });
    await actions.move((await categories.getAll())[1], 1);
    expect(await names()).toEqual(['Domov', 'Kancelář']);
  });

  it('moves categories that share the same order', async () => {
    const now = '2026-10-15T10:00:00.000Z';
    await categories.bulkPut([
      { id: 'a', name: 'A', icon: 'home', color: 'blue', order: 0, createdAt: now, updatedAt: now },
      { id: 'b', name: 'B', icon: 'home', color: 'blue', order: 0, createdAt: now, updatedAt: now },
      { id: 'c', name: 'C', icon: 'home', color: 'blue', order: 0, createdAt: now, updatedAt: now },
    ]);
    const before = await names();

    await actions.move((await categories.getAll())[2], -1);

    expect(await names()).toEqual([before[0], before[2], before[1]]);
    expect((await categories.getAll()).map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it('removes a category and keeps its tasks and notes without it', async () => {
    const work = await actions.add({ name: 'Práce', icon: 'briefcase', color: 'blue' });
    await tasks.put({ ...createTask('t', 'Úkol', '2026-10-15T10:00:00.000Z'), categoryId: work.id });
    await notes.put({ ...createNote('n', '2026-10-15T10:00:00.000Z'), categoryId: work.id });

    await actions.remove(work);

    expect(await names()).toEqual([]);
    expect('categoryId' in (tasks.tasks.get('t') ?? {})).toBe(false);
    expect('categoryId' in (notes.notes.get('n') ?? {})).toBe(false);
  });
});
