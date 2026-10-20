import { Task } from './task';

export type TasksView = 'today' | 'important' | 'planned' | 'all';

export const TASK_VIEWS: readonly { view: TasksView; label: string; empty: string }[] = [
  { view: 'today', label: 'Můj den', empty: 'Na dnešek žádné úkoly' },
  { view: 'important', label: 'Důležité', empty: 'Žádné důležité úkoly' },
  { view: 'planned', label: 'Naplánované', empty: 'Žádné naplánované úkoly' },
  { view: 'all', label: 'Vše', empty: 'Zatím žádné úkoly' },
];

export function isTasksView(value: unknown): value is TasksView {
  return TASK_VIEWS.some((item) => item.view === value);
}

// Místní datum RRRR-MM-DD
export function localDate(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + days));
}

// Můj den = přidané na dnešek nebo s dnešním termínem
export function inTaskView(task: Task, view: TasksView, today: string): boolean {
  if (task.deletedAt) {
    return false;
  }
  switch (view) {
    case 'today':
      return task.myDay === today || task.dueDate === today;
    case 'important':
      return task.important;
    case 'planned':
      return task.dueDate !== undefined;
    case 'all':
      return true;
  }
}

// Otevřené od nejnovějšího (naplánované podle termínu), hotové od naposledy dokončeného
export function queryTasks(tasks: Task[], view: TasksView, today: string): { open: Task[]; done: Task[] } {
  const visible = tasks.filter((task) => inTaskView(task, view, today));
  const newest = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || newest(a, b);
  return {
    open: visible.filter((task) => !task.done).sort(view === 'planned' ? byDue : newest),
    done: visible
      .filter((task) => task.done)
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)),
  };
}

// Text termínu: Dnes, Zítra, Včera, jinak „po 26. 10.“
export function dueLabel(dueDate: string, today: string): string {
  if (dueDate === today) {
    return 'Dnes';
  }
  if (dueDate === addDays(today, 1)) {
    return 'Zítra';
  }
  if (dueDate === addDays(today, -1)) {
    return 'Včera';
  }
  const [year, month, day] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString('cs-CZ', { weekday: 'short' });
  return `${weekday} ${day}. ${month}.${year === Number(today.slice(0, 4)) ? '' : ` ${year}`}`;
}
