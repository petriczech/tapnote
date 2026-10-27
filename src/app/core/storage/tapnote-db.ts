import { Service } from '@angular/core';
import { Dexie, Table } from 'dexie';
import { Category } from '../model/category';
import { Note } from '../model/note';
import { NoteVersion } from '../model/note-version';
import { OutboxEntry } from '../model/outbox-entry';
import { Task } from '../model/task';
import { FLUSH_EVENT, FLUSH_TIMEOUT_MS } from './flush-event';
import { outboxMiddleware } from './outbox-middleware';

// Jedna databáze pro všechny repozitáře, aby se verze schématu nehádaly
@Service()
export class TapnoteDb extends Dexie {
  notes!: Table<Note, string>;
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  versions!: Table<NoteVersion, string>;
  outbox!: Table<OutboxEntry, [string, string]>;

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
    // Fronta změn pro synchronizaci; dosavadní data se při upgradu do fronty nezařazují,
    // první nahrání obstará sloučení při prvním přihlášení (S6)
    this.version(5).stores({ outbox: '[collection+id]' });
    this.use(outboxMiddleware);
    // Upgrade z jiné záložky: stará verze aplikace se nesmí znovu otevřít (Dexie by ji otevřel i nad novějším
    // schématem a zapisovala by bez fronty), proto se spojení zavře natrvalo a záložka se načte znovu.
    // Rozepsaný text editoru se předtím uloží, po zavření by odložené uložení selhalo.
    this.on('versionchange', (event) => {
      const pending: Promise<void>[] = [];
      dispatchEvent(new CustomEvent(FLUSH_EVENT, { detail: pending }));
      // Uložení, které se nedokončí, nesmí zablokovat upgrade v jiné záložce
      void Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))])
        .catch(() => undefined)
        .then(() => {
          this.close({ disableAutoOpen: true });
          if (event.newVersion) {
            location.reload();
          }
        });
      return false;
    });
  }
}
