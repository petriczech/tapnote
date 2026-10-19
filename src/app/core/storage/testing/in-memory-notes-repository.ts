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

  async update(id: string, changes: Partial<Omit<Note, 'id'>>): Promise<void> {
    const note = this.notes.get(id);
    if (note) {
      const updated: Note = { ...note, ...changes };
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined) {
          Reflect.deleteProperty(updated, key);
        }
      }
      this.notes.set(id, updated);
    }
  }

  async delete(id: string): Promise<void> {
    if (this.failDelete) {
      throw new Error('delete failed');
    }
    this.notes.delete(id);
  }

  async purgeTrash(before: string): Promise<number> {
    const expired = [...this.notes.values()].filter((note) => note.deletedAt !== undefined && note.deletedAt < before);
    expired.forEach((note) => this.notes.delete(note.id));
    return expired.length;
  }

  async replaceAll(notes: Note[]): Promise<void> {
    this.notes.clear();
    await this.bulkPut(notes);
  }
}
