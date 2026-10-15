import { Note } from '../model/note';

export abstract class NotesRepository {
  abstract get(id: string): Promise<Note | undefined>;
  abstract getAll(): Promise<Note[]>;
  abstract put(note: Note): Promise<void>;
  abstract bulkPut(notes: Note[]): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract replaceAll(notes: Note[]): Promise<void>;
}
