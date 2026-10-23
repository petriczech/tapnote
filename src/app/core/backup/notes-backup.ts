import { Category, isCategory } from '../model/category';
import { isNote, isRecord, Note } from '../model/note';
import { isTask, Task } from '../model/task';

// Verze 2 přidala úkoly a kategorie, verze 3 pořadí úkolů; starší zálohy se převedou při importu
export const EXPORT_SCHEMA_VERSION = 3;

export interface BackupData {
  notes: Note[];
  tasks: Task[];
  categories: Category[];
}

export interface NotesExport extends BackupData {
  schemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
}

// Čas posledního exportu (ISO 8601)
export const LAST_BACKUP_KEY = 'tapnote.lastBackup';
export const BACKUP_REMINDER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ImportError = 'json' | 'version' | 'format';
export type ParsedExport = ({ ok: true } & BackupData) | { ok: false; error: ImportError };

export function createExport(data: BackupData, now: Date): NotesExport {
  return { schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: now.toISOString(), ...data };
}

// tapnote-RRRR-MM-DD.json podle místního data
export function exportFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `tapnote-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// Kontrola a převod zálohy na aktuální verzi formátu
export function parseExport(text: string): ParsedExport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!isRecord(value)) {
    return { ok: false, error: 'format' };
  }
  const version = value['schemaVersion'];
  if (typeof version === 'number' && version > EXPORT_SCHEMA_VERSION) {
    return { ok: false, error: 'version' };
  }
  // Verze 1 má jen poznámky, verze 2 úkoly bez pořadí (doplní se níž)
  const tasks = version === 1 ? [] : value['tasks'];
  const categories = version === 1 ? [] : value['categories'];
  if (
    (version !== 1 && version !== 2 && version !== EXPORT_SCHEMA_VERSION) ||
    typeof value['exportedAt'] !== 'string' ||
    !Array.isArray(value['notes']) ||
    !value['notes'].every(isNote) ||
    !Array.isArray(tasks) ||
    !tasks.every(isTask) ||
    !Array.isArray(categories) ||
    !categories.every(isCategory)
  ) {
    return { ok: false, error: 'format' };
  }
  const notes = value['notes'].map(normalizeNote);
  const normalizedTasks = version === 2 ? newestFirst(tasks.map(normalizeTask)) : tasks.map(normalizeTask);
  const normalizedCategories = categories.map(normalizeCategory);
  return allDefined(notes) && allDefined(normalizedTasks) && allDefined(normalizedCategories)
    ? { ok: true, notes, tasks: normalizedTasks, categories: normalizedCategories }
    : { ok: false, error: 'format' };
}

// Pořadí úkolů ze zálohy verze 2 podle tehdejšího řazení od nejnovějšího; pořadí v poli zůstává. Pořadí,
// které už v záloze je (export starší verze z jiné záložky po migraci databáze), se nechá
function newestFirst(tasks: (Task | undefined)[]): (Task | undefined)[] {
  const sorted = tasks.filter((task) => task !== undefined).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return tasks.map((task) => task && { ...task, order: task.order ?? sorted.indexOf(task) });
}

function allDefined<T>(items: (T | undefined)[]): items is T[] {
  return items.every((item) => item !== undefined);
}

// Čas v ISO 8601 (UTC), aby šel porovnávat jako text; neplatný = undefined
function iso(value: string): string | undefined {
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

// Skutečné datum RRRR-MM-DD (2026-13-45 neprojde)
function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && iso(`${value}T00:00:00.000Z`)?.slice(0, 10) === value;
}

// Jen známá pole a data v ISO 8601 (UTC); neplatné datum = undefined
function normalizeNote(note: Note): Note | undefined {
  const createdAt = iso(note.createdAt);
  const updatedAt = iso(note.updatedAt);
  const deletedAt = note.deletedAt === undefined ? undefined : iso(note.deletedAt);
  if (!createdAt || !updatedAt || (note.deletedAt !== undefined && !deletedAt)) {
    return undefined;
  }
  const { id, title, content, tags, color, pinned, archived, isTemplate, categoryId } = note;
  return {
    id,
    title,
    content,
    tags,
    ...(color === undefined ? {} : { color }),
    pinned,
    archived,
    isTemplate,
    ...(categoryId === undefined ? {} : { categoryId }),
    createdAt,
    updatedAt,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function normalizeTask(task: Task): Task | undefined {
  const createdAt = iso(task.createdAt);
  const updatedAt = iso(task.updatedAt);
  const completedAt = task.completedAt === undefined ? undefined : iso(task.completedAt);
  const deletedAt = task.deletedAt === undefined ? undefined : iso(task.deletedAt);
  const datesValid = [task.dueDate, task.myDay].every((date) => date === undefined || isDateOnly(date));
  if (
    !createdAt ||
    !updatedAt ||
    !datesValid ||
    (task.completedAt !== undefined && !completedAt) ||
    (task.deletedAt !== undefined && !deletedAt)
  ) {
    return undefined;
  }
  const { id, title, done, important, dueDate, myDay, note, categoryId, order } = task;
  return {
    id,
    title,
    done,
    important,
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(myDay === undefined ? {} : { myDay }),
    steps: task.steps.map(({ id, title, done }) => ({ id, title, done })),
    note,
    ...(categoryId === undefined ? {} : { categoryId }),
    ...(order === undefined ? {} : { order }),
    createdAt,
    updatedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

function normalizeCategory(category: Category): Category | undefined {
  const createdAt = iso(category.createdAt);
  const updatedAt = iso(category.updatedAt);
  if (!createdAt || !updatedAt) {
    return undefined;
  }
  const { id, name, icon, color, order } = category;
  return { id, name, icon, color, order, createdAt, updatedAt };
}

// Položky k zápisu: nové a novější podle updatedAt, v záloze jen nejnovější verze každého id
export function mergeNewer<T extends { id: string; updatedAt: string }>(existing: T[], incoming: T[]): T[] {
  const newest = new Map<string, T>();
  for (const item of incoming) {
    const kept = newest.get(item.id);
    if (!kept || item.updatedAt > kept.updatedAt) {
      newest.set(item.id, item);
    }
  }
  const current = new Map(existing.map((item) => [item.id, item]));
  return [...newest.values()].filter((item) => {
    const stored = current.get(item.id);
    return !stored || item.updatedAt > stored.updatedAt;
  });
}

export function readLastBackup(): string | undefined {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function writeLastBackup(now: Date): void {
  try {
    localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
  } catch {
    // Bez úložiště se připomínka jen neodloží
  }
}

// Počet dní bez zálohy od poslední zálohy, jinak od nejstarší poznámky; undefined pod hranicí připomínky
export function daysWithoutBackup(lastBackup: string | undefined, notes: Note[], now: Date): number | undefined {
  const created = notes.filter((note) => !note.deletedAt).map((note) => Date.parse(note.createdAt));
  if (created.length === 0) {
    return undefined;
  }
  const since = Math.max(Date.parse(lastBackup ?? '') || 0, Math.min(...created));
  const days = Math.floor((now.getTime() - since) / DAY_MS);
  return days >= BACKUP_REMINDER_DAYS ? days : undefined;
}
