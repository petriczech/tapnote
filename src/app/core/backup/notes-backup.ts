import { isNotesExport, Note, NOTES_SCHEMA_VERSION, NotesExport } from '../model/note';

// Čas posledního exportu (ISO 8601)
export const LAST_BACKUP_KEY = 'tapnote.lastBackup';
export const BACKUP_REMINDER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ImportError = 'json' | 'version' | 'format';
export type ParsedExport = { ok: true; notes: Note[] } | { ok: false; error: ImportError };

export function createExport(notes: Note[], now: Date): NotesExport {
  return { schemaVersion: NOTES_SCHEMA_VERSION, exportedAt: now.toISOString(), notes };
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
  const version = typeof value === 'object' && value !== null ? (value as { schemaVersion?: unknown }).schemaVersion : undefined;
  if (typeof version === 'number' && version > NOTES_SCHEMA_VERSION) {
    return { ok: false, error: 'version' };
  }
  // Starší verze se převedou zde, zatím existuje jen verze 1
  if (!isNotesExport(value)) {
    return { ok: false, error: 'format' };
  }
  const notes = value.notes.map(normalizeNote);
  return notes.every((note) => note !== undefined) ? { ok: true, notes } : { ok: false, error: 'format' };
}

// Jen známá pole a data v ISO 8601 (UTC), aby šla porovnávat jako text; neplatné datum = undefined
function normalizeNote(note: Note): Note | undefined {
  const iso = (value: string) => {
    const time = Date.parse(value);
    return Number.isNaN(time) ? undefined : new Date(time).toISOString();
  };
  const createdAt = iso(note.createdAt);
  const updatedAt = iso(note.updatedAt);
  const deletedAt = note.deletedAt === undefined ? undefined : iso(note.deletedAt);
  if (!createdAt || !updatedAt || (note.deletedAt !== undefined && !deletedAt)) {
    return undefined;
  }
  const { id, title, content, tags, color, pinned, archived, isTemplate } = note;
  return {
    id,
    title,
    content,
    tags,
    ...(color === undefined ? {} : { color }),
    pinned,
    archived,
    isTemplate,
    createdAt,
    updatedAt,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

// Poznámky k zápisu: nové a novější podle updatedAt, v záloze jen nejnovější verze každého id
export function mergeNotes(existing: Note[], incoming: Note[]): Note[] {
  const newest = new Map<string, Note>();
  for (const note of incoming) {
    const kept = newest.get(note.id);
    if (!kept || note.updatedAt > kept.updatedAt) {
      newest.set(note.id, note);
    }
  }
  const current = new Map(existing.map((note) => [note.id, note]));
  return [...newest.values()].filter((note) => {
    const stored = current.get(note.id);
    return !stored || note.updatedAt > stored.updatedAt;
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
