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
    // Ruční pořadí úkolů (R5) bez indexu; dosavadní řazení od nejnovějšího se zachová, updatedAt zůstává
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const tasks = tx.table<Task, string>('tasks');
        // Záznam bez createdAt nesmí upgrade shodit (neotevřely by se ani poznámky)
        const all = (await tasks.toArray()).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
        await tasks.bulkPut(all.map((task, order) => ({ ...task, order })));
      });
  }
}
