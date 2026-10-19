import { Note } from './note';

export type NotesView = 'notes' | 'archive' | 'trash';

export const NOTES_VIEWS: readonly NotesView[] = ['notes', 'archive', 'trash'];

export function isNotesView(value: unknown): value is NotesView {
  return NOTES_VIEWS.includes(value as NotesView);
}

export function inView(note: Note, view: NotesView): boolean {
  if (note.isTemplate) {
    return false;
  }
  if (view === 'trash') {
    return note.deletedAt !== undefined;
  }
  return note.deletedAt === undefined && note.archived === (view === 'archive');
}

// Koš podle smazání, jinak připnuté a pak nejnovější
export function queryNotes(notes: Note[], view: NotesView, tag?: string): Note[] {
  return notes
    .filter((note) => inView(note, view) && (!tag || note.tags.includes(tag)))
    .sort((a, b) =>
      view === 'trash'
        ? (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')
        : Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
    );
}

// Šablony mimo koš podle názvu
export function templatesOf(notes: Note[]): Note[] {
  return notes
    .filter((note) => note.isTemplate && note.deletedAt === undefined)
    .sort((a, b) => a.title.localeCompare(b.title, 'cs'));
}

export function collectTags(notes: Note[], view: NotesView): string[] {
  const tags = notes.filter((note) => inView(note, view)).flatMap((note) => note.tags);
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b, 'cs'));
}

// Text pod titulkem pro náhled
export function snippet(content: string): string {
  const lines = content.split('\n');
  const titleLine = lines.findIndex((line) => line.trim() !== '');
  return lines
    .slice(titleLine + 1)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}
