import { isOptionalString, isRecord } from './note';

export interface TaskStep {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  important: boolean;
  // Datum bez času (RRRR-MM-DD)
  dueDate?: string;
  // Datum, kdy byl úkol přidán do Můj den (RRRR-MM-DD)
  myDay?: string;
  steps: TaskStep[];
  // Markdown
  note: string;
  categoryId?: string;
  // ISO 8601
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  // Koš
  deletedAt?: string;
}

export function createTask(id: string, title: string, now: string): Task {
  return { id, title, done: false, important: false, steps: [], note: '', createdAt: now, updatedAt: now };
}

function isTaskStep(value: unknown): value is TaskStep {
  return (
    isRecord(value) && typeof value['id'] === 'string' && typeof value['title'] === 'string' && typeof value['done'] === 'boolean'
  );
}

export function isTask(value: unknown): value is Task {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['done'] === 'boolean' &&
    typeof value['important'] === 'boolean' &&
    isOptionalString(value['dueDate']) &&
    isOptionalString(value['myDay']) &&
    Array.isArray(value['steps']) &&
    value['steps'].every(isTaskStep) &&
    typeof value['note'] === 'string' &&
    isOptionalString(value['categoryId']) &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    isOptionalString(value['completedAt']) &&
    isOptionalString(value['deletedAt'])
  );
}
