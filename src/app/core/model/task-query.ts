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

// Ruční pořadí; stejné hodnoty (sloučený import starší zálohy) od nejnovějšího
const newest = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);
const byOrder = (a: Task, b: Task) => (a.order ?? 0) - (b.order ?? 0) || newest(a, b);

// Otevřené v ručním pořadí (naplánované podle termínu), hotové od naposledy dokončeného
export function queryTasks(tasks: Task[], view: TasksView, today: string): { open: Task[]; done: Task[] } {
  const visible = tasks.filter((task) => inTaskView(task, view, today));
  const byDue = (a: Task, b: Task) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '') || newest(a, b);
  return {
    open: visible.filter((task) => !task.done).sort(view === 'planned' ? byDue : byOrder),
    done: visible
      .filter((task) => task.done)
      .sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt)),
  };
}

// Přesun úkolu id těsně před úkol targetId (after = za něj) v pořadí všech úkolů včetně skrytých, hotových
// a smazaných, takže ostatní si vzájemné pořadí nechají i v pohledu jen s částí úkolů. Přesunutý úkol dostane
// hodnotu mezi novými sousedy (na okraji o 1 dál) a mění se jen on; při stejných hodnotách sousedů se pořadí
// přečísluje od nejmenší hodnoty po jedné. Vrací se jen úkoly se změněnou hodnotou.
export function reorderTasks(tasks: Task[], id: string, targetId: string, after: boolean): { id: string; order: number }[] {
  const sorted = [...tasks].sort(byOrder);
  const task = sorted.find((item) => item.id === id);
  const rest = sorted.filter((item) => item.id !== id);
  const target = rest.findIndex((item) => item.id === targetId);
  if (!task || target < 0) {
    return [];
  }
  const at = target + (after ? 1 : 0);
  const before = at > 0 ? (rest[at - 1].order ?? 0) : undefined;
  const next = at < rest.length ? (rest[at].order ?? 0) : undefined;
  const order = before === undefined ? (next ?? 0) - 1 : next === undefined ? before + 1 : (before + next) / 2;
  if ((before === undefined || before < order) && (next === undefined || order < next)) {
    return [{ id, order }];
  }
  rest.splice(at, 0, task);
  const base = sorted[0].order ?? 0;
  return rest.flatMap((item, index) => (item.order === base + index ? [] : [{ id: item.id, order: base + index }]));
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
