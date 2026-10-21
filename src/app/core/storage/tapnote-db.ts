import { Service } from '@angular/core';
import { Dexie, Table } from 'dexie';
import { Category } from '../model/category';
import { Note } from '../model/note';
import { NoteVersion } from '../model/note-version';
import { Task } from '../model/task';

// Jedna databáze pro všechny repozitáře, aby se verze schématu nehádaly
@Service()
export class TapnoteDb extends Dexie {
  notes!: Table<Note, string>;
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  versions!: Table<NoteVersion, string>;

  constructor() {
    super('tapnote');
    // Bez boolean indexů
    this.version(1).stores({ notes: 'id, updatedAt, deletedAt, *tags' });
    this.version(2).stores({ tasks: 'id, updatedAt, deletedAt, categoryId', categories: 'id, order' });
    this.version(3).stores({ versions: 'id, noteId, createdAt' });
  }
}
