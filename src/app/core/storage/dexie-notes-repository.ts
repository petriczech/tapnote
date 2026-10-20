import { inject, Injectable } from '@angular/core';
import { Note } from '../model/note';
import { NotesRepository } from './notes-repository';
import { TapnoteDb } from './tapnote-db';

@Injectable()
export class DexieNotesRepository extends NotesRepository {
  private readonly db = inject(TapnoteDb);

  get(id: string): Promise<Note | undefined> {
    return this.db.notes.get(id);
  }

  getAll(): Promise<Note[]> {
    return this.db.notes.toArray();
  }

  getLatest(): Promise<Note | undefined> {
    return this.db.notes
      .orderBy('updatedAt')
      .reverse()
      .filter((note) => !note.deletedAt && !note.archived && !note.isTemplate)
      .first();
  }

  async put(note: Note): Promise<void> {
    await this.db.notes.put(note);
  }

  async bulkPut(notes: Note[]): Promise<void> {
    await this.db.notes.bulkPut(notes);
  }

  async update(id: string, changes: Partial<Omit<Note, 'id'>>): Promise<void> {
    await this.db.notes.update(id, changes);
  }

  delete(id: string): Promise<void> {
    return this.db.notes.delete(id);
  }

  purgeTrash(before: string): Promise<number> {
    return this.db.notes.where('deletedAt').below(before).delete();
  }

  replaceAll(notes: Note[]): Promise<void> {
    return this.db.transaction('rw', this.db.notes, async () => {
      await this.db.notes.clear();
      await this.db.notes.bulkAdd(notes);
    });
  }
}
