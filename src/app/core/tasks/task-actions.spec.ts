import { TestBed } from '@angular/core/testing';
import { createTask, Task } from '../model/task';
import { TRASH_RETENTION_MS } from '../notes/note-actions';
import { TasksRepository } from '../storage/tasks-repository';
import { InMemoryTasksRepository } from '../storage/testing/in-memory-tasks-repository';
import { TaskActions } from './task-actions';

describe('TaskActions', () => {
  let repository: InMemoryTasksRepository;
  let actions: TaskActions;

  const stored = (id: string) => repository.tasks.get(id) as Task;

  beforeEach(() => {
    repository = new InMemoryTasksRepository();
    TestBed.configureTestingModule({ providers: [{ provide: TasksRepository, useValue: repository }] });
    actions = TestBed.inject(TaskActions);
  });

  it('adds a trimmed task with the given fields', async () => {
    const task = await actions.add('  Nakoupit  ', { important: true, dueDate: '2026-10-21' });

    expect(stored(task.id)).toMatchObject({ title: 'Nakoupit', important: true, dueDate: '2026-10-21', done: false });
  });

  it('puts a new task at the top', async () => {
    await repository.put({ ...createTask('old', 'Starý', '2026-10-15T10:00:00.000Z'), order: 3 });

    const first = await actions.add('První', {});
    const second = await actions.add('Druhý', {});

    expect(stored(first.id).order).toBe(2);
    expect(stored(second.id).order).toBe(1);
  });

  it('starts the order at zero', async () => {
    expect(stored((await actions.add('Jediný', {})).id).order).toBe(0);
  });

  it('completes and reopens a task', async () => {
    const task = await actions.add('Nakoupit', {});

    await actions.toggleDone(task);
    expect(stored(task.id).completedAt).toBeDefined();

    await actions.toggleDone(stored(task.id));
    expect(stored(task.id).done).toBe(false);
    expect('completedAt' in stored(task.id)).toBe(false);
  });

  it('moves to the trash, restores and purges old trash', async () => {
    const task = await actions.add('Nakoupit', {});
    await actions.trash(task);
    expect(stored(task.id).deletedAt).toBeDefined();
    await actions.restore(task);
    expect('deletedAt' in stored(task.id)).toBe(false);

    const old = new Date(Date.now() - TRASH_RETENTION_MS - 1000).toISOString();
    await repository.put({ ...createTask('old', 'Starý', old), deletedAt: old });
    expect(await actions.purgeTrash()).toBe(1);
    expect(repository.tasks.has('old')).toBe(false);
    expect(repository.tasks.has(task.id)).toBe(true);
  });
});
