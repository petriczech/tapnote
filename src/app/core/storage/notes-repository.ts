import { Observable } from 'rxjs';
import { Note } from '../model/note';

export abstract class NotesRepository {
  abstract get(id: string): Promise<Note | undefined>;
  // Uložená podoba poznámky po každé změně (i z jiné záložky nebo ze synchronizace)
  abstract watch(id: string): Observable<Note | undefined>;
  abstract getAll(): Promise<Note[]>;
  // Poslední upravená aktivní poznámka
  abstract getLatest(): Promise<Note | undefined>;
  abstract put(note: Note): Promise<void>;
  abstract bulkPut(notes: Note[]): Promise<void>;
  // Změní se jen uvedená pole, pole s undefined se odstraní
  abstract update(id: string, changes: Partial<Omit<Note, 'id'>>): Promise<void>;
  abstract delete(id: string): Promise<void>;
  // Id poznámek přesunutých do koše před `before`
  abstract getTrashedIdsBefore(before: string): Promise<string[]>;
  // Trvalé smazání poznámek přesunutých do koše před `before`
  abstract purgeTrash(before: string): Promise<number>;
  abstract replaceAll(notes: Note[]): Promise<void>;
}
