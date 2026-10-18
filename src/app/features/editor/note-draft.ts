import { Injectable, inject, signal } from '@angular/core';
import { createNote, deriveTitle, Note } from '../../core/model/note';
import { NotesRepository } from '../../core/storage/notes-repository';

export const RESUME_WINDOW_MS = 5 * 60 * 1000;
export const SAVE_DEBOUNCE_MS = 300;

@Injectable()
export class NoteDraft {
  private readonly repository = inject(NotesRepository);

  readonly content = signal('');
  readonly loading = signal(false);
  readonly saveFailed = signal(false);

  private note: Note | undefined;
  private createdHere = false;
  private touched = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();

  // false = poznámka podle id neexistuje, je v koši nebo nejde načíst
  async open(id: string | undefined, resume: boolean): Promise<boolean> {
    if (id !== undefined) {
      this.loading.set(true);
      try {
        const note = await this.repository.get(id);
        if (!note || note.deletedAt) {
          return false;
        }
        this.load(note);
      } catch {
        return false;
      } finally {
        this.loading.set(false);
      }
    } else if (resume) {
      const note = await this.findResumable().catch(() => undefined);
      // Psaní před načtením má přednost
      if (note && !this.touched) {
        this.load(note);
      }
    }
    return true;
  }

  update(content: string): void {
    this.touched = true;
    this.content.set(content);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queue = this.queue.then(() => this.save());
    return this.queue;
  }

  private load(note: Note): void {
    this.note = note;
    this.content.set(note.content);
  }

  private async findResumable(): Promise<Note | undefined> {
    const latest = await this.repository.getLatest();
    return latest && Date.now() - Date.parse(latest.updatedAt) < RESUME_WINDOW_MS ? latest : undefined;
  }

  private async save(): Promise<void> {
    const content = this.content();
    try {
      if (this.note?.content !== content) {
        await this.persist(content);
      }
      this.saveFailed.set(false);
    } catch {
      this.saveFailed.set(true);
    }
  }

  private async persist(content: string): Promise<void> {
    if (content.trim() === '' && (!this.note || this.createdHere)) {
      if (this.note) {
        await this.repository.delete(this.note.id);
        this.note = undefined;
        this.createdHere = false;
      }
      return;
    }
    const now = new Date().toISOString();
    const note: Note = {
      ...(this.note ?? createNote(crypto.randomUUID(), now)),
      content,
      title: deriveTitle(content),
      updatedAt: now,
    };
    await this.repository.put(note);
    this.createdHere ||= !this.note;
    this.note = note;
  }
}
