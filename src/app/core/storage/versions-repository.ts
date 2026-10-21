import { NoteVersion } from '../model/note-version';

export abstract class VersionsRepository {
  // Verze poznámky od nejnovější
  abstract getForNote(noteId: string): Promise<NoteVersion[]>;
  // Uloží verzi a nejstarší nad počet `keep` smaže
  abstract add(version: NoteVersion, keep: number): Promise<void>;
  abstract deleteForNotes(noteIds: string[]): Promise<void>;
}
