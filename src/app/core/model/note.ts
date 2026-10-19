export const NOTES_SCHEMA_VERSION = 1;

export interface Note {
  id: string;
  title: string;
  // Markdown
  content: string;
  tags: string[];
  color?: string;
  pinned: boolean;
  archived: boolean;
  isTemplate: boolean;
  // ISO 8601
  createdAt: string;
  updatedAt: string;
  // Koš
  deletedAt?: string;
}

export interface NotesExport {
  schemaVersion: typeof NOTES_SCHEMA_VERSION;
  exportedAt: string;
  notes: Note[];
}

export function createNote(id: string, now: string): Note {
  return {
    id,
    title: '',
    content: '',
    tags: [],
    pinned: false,
    archived: false,
    isTemplate: false,
    createdAt: now,
    updatedAt: now,
  };
}

// Název z prvního neprázdného řádku
export function deriveTitle(content: string): string {
  const firstLine = content.split('\n').find((line) => line.trim() !== '') ?? '';
  return firstLine.replace(/^\s*#{1,6}(\s+|$)/, '').trim();
}

// Hashtagy z textu, malými písmeny a bez duplicit
export function extractTags(content: string): string[] {
  const tags = [...content.matchAll(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu)].map((match) => match[1].toLowerCase());
  return [...new Set(tags)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function isNote(value: unknown): value is Note {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['title'] === 'string' &&
    typeof value['content'] === 'string' &&
    Array.isArray(value['tags']) &&
    value['tags'].every((tag) => typeof tag === 'string') &&
    isOptionalString(value['color']) &&
    typeof value['pinned'] === 'boolean' &&
    typeof value['archived'] === 'boolean' &&
    typeof value['isTemplate'] === 'boolean' &&
    typeof value['createdAt'] === 'string' &&
    typeof value['updatedAt'] === 'string' &&
    isOptionalString(value['deletedAt'])
  );
}

export function isNotesExport(value: unknown): value is NotesExport {
  return (
    isRecord(value) &&
    value['schemaVersion'] === NOTES_SCHEMA_VERSION &&
    typeof value['exportedAt'] === 'string' &&
    Array.isArray(value['notes']) &&
    value['notes'].every(isNote)
  );
}
