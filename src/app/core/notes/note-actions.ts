import { inject, Service } from '@angular/core';
import { Note } from '../model/note';
import { NoteColor } from '../model/note-colors';
import { NotesRepository } from '../storage/notes-repository';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Service()
export class NoteActions {
  private readonly repository = inject(NotesRepository);

  togglePin(note: Note): Promise<void> {
    return this.change(note, { pinned: !note.pinned });
  }

  setArchived(note: Note, archived: boolean): Promise<void> {
    return this.change(note, { archived });
  }

  // Šablona ani poznámka z ní vrácená nezůstává v archivu
  setTemplate(note: Note, isTemplate: boolean): Promise<void> {
    return this.change(note, { isTemplate, archived: false });
  }

  // undefined = bez barvy (pole se odstraní)
  setColor(note: Note, color: NoteColor | undefined): Promise<void> {
    return this.change(note, { color });
  }

  // undefined = bez kategorie (pole se odstraní)
  setCategory(note: Note, categoryId: string | undefined): Promise<void> {
    return this.change(note, { categoryId });
  }

  trash(note: Note): Promise<void> {
    return this.change(note, { deletedAt: new Date().toISOString() });
  }

  restore(note: Note): Promise<void> {
    return this.change(note, { deletedAt: undefined });
  }

  deletePermanently(note: Note): Promise<void> {
    return this.repository.delete(note.id);
  }

  purgeTrash(): Promise<number> {
    return this.repository.purgeTrash(new Date(Date.now() - TRASH_RETENTION_MS).toISOString());
  }

  private change(note: Note, changes: Partial<Omit<Note, 'id'>>): Promise<void> {
    return this.repository.update(note.id, { ...changes, updatedAt: new Date().toISOString() });
  }
}
