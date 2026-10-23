import { createTask, Task } from './task';
import { addDays, dueLabel, inTaskView, isTasksView, localDate, queryTasks, reorderTasks } from './task-query';

const TODAY = '2026-10-20';

function task(id: string, overrides: Partial<Task> = {}): Task {
  return { ...createTask(id, id, `2026-10-1${id.length}T10:00:00.000Z`), ...overrides };
}

describe('task query', () => {
  it('recognizes views', () => {
    expect(isTasksView('planned')).toBe(true);
    expect(isTasksView('notes')).toBe(false);
  });

  it('formats and shifts local dates', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it.each([
    ['today', ['myday', 'due']],
    ['important', ['star']],
    ['planned', ['due', 'later']],
    ['all', ['myday', 'due', 'star', 'later', 'plain']],
  ] as const)('filters the %s view', (view, ids) => {
    const tasks = [
      task('myday', { myDay: TODAY }),
      task('due', { dueDate: TODAY }),
      task('star', { important: true }),
      task('later', { dueDate: '2026-10-25' }),
      task('plain'),
      task('gone', { important: true, deletedAt: '2026-10-19T10:00:00.000Z' }),
    ];

    expect(tasks.filter((item) => inTaskView(item, view, TODAY)).map((item) => item.id).sort()).toEqual([...ids].sort());
  });

  it('splits open and done tasks with planned ones by due date', () => {
    const tasks = [
      task('b', { dueDate: '2026-10-25' }),
      task('aa', { dueDate: '2026-10-21' }),
      task('ccc', { dueDate: '2026-10-22', done: true, completedAt: '2026-10-19T10:00:00.000Z' }),
      task('dddd', { dueDate: '2026-10-22', done: true, completedAt: '2026-10-20T10:00:00.000Z' }),
    ];

    const result = queryTasks(tasks, 'planned', TODAY);

    expect(result.open.map((item) => item.id)).toEqual(['aa', 'b']);
    expect(result.done.map((item) => item.id)).toEqual(['dddd', 'ccc']);
    expect(queryTasks(tasks, 'all', TODAY).open.map((item) => item.id)).toEqual(['aa', 'b']);
  });

  it('sorts open tasks by manual order except planned, ties from the newest', () => {
    const tasks = [
      task('a', { order: 2, dueDate: '2026-10-21' }),
      task('bb', { order: 0, dueDate: '2026-10-25' }),
      task('ccc', { order: 1 }),
      task('dddd', { order: 1, important: true }),
    ];

    expect(queryTasks(tasks, 'all', TODAY).open.map((item) => item.id)).toEqual(['bb', 'dddd', 'ccc', 'a']);
    expect(queryTasks(tasks, 'planned', TODAY).open.map((item) => item.id)).toEqual(['a', 'bb']);
  });

  it('moves only the task between its new neighbours and keeps the order of hidden tasks', () => {
    // Pořadí všech: a, x (skrytý), b, c; v pohledu jen a, b, c
    const tasks = [task('a', { order: -1 }), task('x', { order: 0 }), task('b', { order: 1 }), task('c', { order: 2 })];
    const apply = (changes: { id: string; order: number }[]) =>
      queryTasks(tasks.map((item) => ({ ...item, order: changes.find((change) => change.id === item.id)?.order ?? item.order })), 'all', TODAY)
        .open.map((item) => item.id);

    const up = reorderTasks(tasks, 'c', 'a', false);
    expect(apply(up)).toEqual(['c', 'a', 'x', 'b']);
    expect(up).toEqual([{ id: 'c', order: -2 }]);

    const down = reorderTasks(tasks, 'a', 'b', true);
    expect(apply(down)).toEqual(['x', 'b', 'a', 'c']);
    expect(down).toEqual([{ id: 'a', order: 1.5 }]);
    expect(reorderTasks(tasks, 'a', 'c', true)).toEqual([{ id: 'a', order: 3 }]);

    expect(reorderTasks(tasks, 'a', 'missing', true)).toEqual([]);
  });

  it('renumbers when the new neighbours have equal orders', () => {
    const tasks = [task('a', { order: 0 }), task('bb', { order: 0 }), task('ccc'), task('dddd', { order: undefined })];

    // Od nejnovějšího: dddd (bez pořadí = 0), ccc, bb, a; a se přesune mezi ccc a bb
    expect(reorderTasks(tasks, 'a', 'bb', false)).toEqual([
      { id: 'dddd', order: 0 },
      { id: 'ccc', order: 1 },
      { id: 'a', order: 2 },
      { id: 'bb', order: 3 },
    ]);
    expect(reorderTasks(tasks, 'a', 'dddd', false)).toEqual([{ id: 'a', order: -1 }]);
  });

  it('labels due dates relative to today', () => {
    expect(dueLabel(TODAY, TODAY)).toBe('Dnes');
    expect(dueLabel('2026-10-21', TODAY)).toBe('Zítra');
    expect(dueLabel('2026-10-19', TODAY)).toBe('Včera');
    expect(dueLabel('2026-10-26', TODAY)).toBe('po 26. 10.');
    expect(dueLabel('2027-01-04', TODAY)).toBe('po 4. 1. 2027');
  });
});
