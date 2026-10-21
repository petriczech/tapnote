import { NoteVersion } from '../../model/note-version';
import { VersionsRepository } from '../versions-repository';

// Testovací náhrada DexieVersionsRepository
export class InMemoryVersionsRepository extends VersionsRepository {
  readonly versions = new Map<string, NoteVersion>();

  async getForNote(noteId: string): Promise<NoteVersion[]> {
    return [...this.versions.values()]
      .filter((version) => version.noteId === noteId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async add(version: NoteVersion, keep: number): Promise<void> {
    this.versions.set(version.id, version);
    (await this.getForNote(version.noteId)).slice(keep).forEach((old) => this.versions.delete(old.id));
  }

  async deleteForNotes(noteIds: string[]): Promise<void> {
    [...this.versions.values()].filter((version) => noteIds.includes(version.noteId)).forEach((version) => this.versions.delete(version.id));
  }
}
