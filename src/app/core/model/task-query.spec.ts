import { createTask, Task } from './task';
import { addDays, dueLabel, inTaskView, isTasksView, localDate, queryTasks } from './task-query';

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

  it('labels due dates relative to today', () => {
    expect(dueLabel(TODAY, TODAY)).toBe('Dnes');
    expect(dueLabel('2026-10-21', TODAY)).toBe('Zítra');
    expect(dueLabel('2026-10-19', TODAY)).toBe('Včera');
    expect(dueLabel('2026-10-26', TODAY)).toBe('po 26. 10.');
    expect(dueLabel('2027-01-04', TODAY)).toBe('po 4. 1. 2027');
  });
});
