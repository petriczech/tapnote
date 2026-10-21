import { inject, Service } from '@angular/core';
import { deriveTitle, extractTags, Note } from '../model/note';
import { NoteColor } from '../model/note-colors';
import { MAX_VERSIONS, NoteVersion } from '../model/note-version';
import { NotesRepository } from '../storage/notes-repository';
import { VersionsRepository } from '../storage/versions-repository';

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

@Service()
export class NoteActions {
  private readonly repository = inject(NotesRepository);
  private readonly versions = inject(VersionsRepository);

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

  // S poznámkou zmizí i její historie
  async deletePermanently(note: Note): Promise<void> {
    await this.repository.delete(note.id);
    await this.versions.deleteForNotes([note.id]);
  }

  async purgeTrash(): Promise<number> {
    const before = new Date(Date.now() - TRASH_RETENTION_MS).toISOString();
    const expired = await this.repository.getTrashedIdsBefore(before);
    const count = await this.repository.purgeTrash(before);
    if (expired.length > 0) {
      await this.versions.deleteForNotes(expired);
    }
    return count;
  }

  // Současné znění se nejdřív uloží jako verze, takže obnovení jde vrátit; poznámka se načte znovu,
  // aby se nepřepsalo, co editor uložil těsně před otevřením historie
  async restoreVersion(note: Note, version: NoteVersion): Promise<void> {
    const current = (await this.repository.get(note.id)) ?? note;
    const now = new Date().toISOString();
    await this.versions.add(
      { id: crypto.randomUUID(), noteId: note.id, content: current.content, createdAt: current.updatedAt },
      MAX_VERSIONS,
    );
    await this.repository.update(note.id, {
      content: version.content,
      title: deriveTitle(version.content),
      tags: extractTags(version.content),
      updatedAt: now,
    });
  }

  private change(note: Note, changes: Partial<Omit<Note, 'id'>>): Promise<void> {
    return this.repository.update(note.id, { ...changes, updatedAt: new Date().toISOString() });
  }
}
