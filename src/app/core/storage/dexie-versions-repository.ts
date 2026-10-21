import { inject, Injectable } from '@angular/core';
import { NoteVersion } from '../model/note-version';
import { TapnoteDb } from './tapnote-db';
import { VersionsRepository } from './versions-repository';

@Injectable()
export class DexieVersionsRepository extends VersionsRepository {
  private readonly db = inject(TapnoteDb);

  async getForNote(noteId: string): Promise<NoteVersion[]> {
    return (await this.db.versions.where('noteId').equals(noteId).sortBy('createdAt')).reverse();
  }

  add(version: NoteVersion, keep: number): Promise<void> {
    return this.db.transaction('rw', this.db.versions, async () => {
      await this.db.versions.put(version);
      const all = await this.db.versions.where('noteId').equals(version.noteId).sortBy('createdAt');
      await this.db.versions.bulkDelete(all.slice(0, Math.max(0, all.length - keep)).map((item) => item.id));
    });
  }

  async deleteForNotes(noteIds: string[]): Promise<void> {
    await this.db.versions.where('noteId').anyOf(noteIds).delete();
  }
}
