import { Note } from '../../model/note';
import { NotesRepository } from '../notes-repository';

// Testovací náhrada DexieNotesRepository
export class InMemoryNotesRepository extends NotesRepository {
  readonly notes = new Map<string, Note>();
  failPut = false;
  failDelete = false;

  async get(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
  }

  async getAll(): Promise<Note[]> {
    return [...this.notes.values()];
  }

  async getLatest(): Promise<Note | undefined> {
    return [...this.notes.values()]
      .filter((note) => !note.deletedAt && !note.archived && !note.isTemplate)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  async put(note: Note): Promise<void> {
    if (this.failPut) {
      throw new Error('put failed');
    }
    this.notes.set(note.id, note);
  }

  async bulkPut(notes: Note[]): Promise<void> {
    notes.forEach((note) => this.notes.set(note.id, note));
  }

  async delete(id: string): Promise<void> {
    if (this.failDelete) {
      throw new Error('delete failed');
    }
    this.notes.delete(id);
  }

  async replaceAll(notes: Note[]): Promise<void> {
    this.notes.clear();
    await this.bulkPut(notes);
  }
}
