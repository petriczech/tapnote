import { Category, isCategory } from './category';
import { createTask, isTask } from './task';

describe('task', () => {
  const task = createTask('1', 'Nakoupit', '2026-10-15T10:00:00.000Z');

  it('creates an open valid task', () => {
    expect(task).toEqual({
      id: '1',
      title: 'Nakoupit',
      done: false,
      important: false,
      steps: [],
      note: '',
      order: 0,
      createdAt: '2026-10-15T10:00:00.000Z',
      updatedAt: '2026-10-15T10:00:00.000Z',
    });
    expect(isTask(task)).toBe(true);
  });

  it('rejects wrong field types', () => {
    expect(isTask({ ...task, done: 'ne' })).toBe(false);
    expect(isTask({ ...task, steps: [{ id: 's', title: 'krok' }] })).toBe(false);
    expect(isTask({ ...task, dueDate: 20 })).toBe(false);
    expect(isTask({ ...task, order: '1' })).toBe(false);
    expect(isTask({ ...task, order: Infinity })).toBe(false);
    expect(isTask({ ...task, order: undefined })).toBe(true);
    expect(isTask(null)).toBe(false);
  });
});

describe('category', () => {
  const category: Category = {
    id: 'c',
    name: 'Domov',
    icon: 'home',
    color: 'orange',
    order: 1,
    createdAt: '2026-10-15T10:00:00.000Z',
    updatedAt: '2026-10-15T10:00:00.000Z',
  };

  it('accepts a valid category', () => {
    expect(isCategory(category)).toBe(true);
  });

  it('rejects an unknown color or missing order', () => {
    expect(isCategory({ ...category, color: 'neon' })).toBe(false);
    expect(isCategory({ ...category, order: '1' })).toBe(false);
  });
});
