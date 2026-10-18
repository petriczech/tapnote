import { Injectable } from '@angular/core';
import { Dexie, Table } from 'dexie';
import { Note } from '../model/note';
import { NotesRepository } from './notes-repository';

class NotesDb extends Dexie {
  notes!: Table<Note, string>;

  constructor() {
    super('tapnote');
    // Bez boolean indexů
    this.version(1).stores({ notes: 'id, updatedAt, deletedAt, *tags' });
  }
}

@Injectable()
export class DexieNotesRepository extends NotesRepository {
  private readonly db = new NotesDb();

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

  delete(id: string): Promise<void> {
    return this.db.notes.delete(id);
  }

  replaceAll(notes: Note[]): Promise<void> {
    return this.db.transaction('rw', this.db.notes, async () => {
      await this.db.notes.clear();
      await this.db.notes.bulkAdd(notes);
    });
  }
}
