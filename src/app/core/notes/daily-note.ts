import { inject, Service } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { createNote, deriveTitle, extractTags, Note } from '../model/note';
import { NotesRepository } from '../storage/notes-repository';

// Tag, podle kterého se denní poznámky poznají a dají vyfiltrovat
export const DAILY_TAG = 'deník';

// Název denní poznámky, např. „Středa 21. října 2026“
export function dailyTitle(now: Date): string {
  const text = now.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return text.charAt(0).toLocaleUpperCase('cs') + text.slice(1);
}

export function isDailyNote(note: Note, title: string): boolean {
  return !note.deletedAt && !note.isTemplate && note.title === title && note.tags.includes(DAILY_TAG);
}

@Service()
export class DailyNote {
  private readonly repository = inject(NotesRepository);
  private pending?: Promise<string>;

  // Id dnešní poznámky; když ještě není, založí se. Souběžná volání v tabu sdílí jedno hledání,
  // mezi taby (dvě spuštění zkratky) brání dvojímu založení zámek, pokud ho prohlížeč umí
  open(now = new Date()): Promise<string> {
    this.pending ??= (
      navigator.locks ? navigator.locks.request('tapnote-daily-note', () => this.findOrCreate(now)) : this.findOrCreate(now)
    ).finally(() => (this.pending = undefined));
    return this.pending;
  }

  private async findOrCreate(now: Date): Promise<string> {
    const title = dailyTitle(now);
    const existing = (await this.repository.getAll()).find((note) => isDailyNote(note, title));
    if (existing) {
      return existing.id;
    }
    const content = `${title}\n#${DAILY_TAG}\n\n`;
    const note: Note = {
      ...createNote(crypto.randomUUID(), now.toISOString()),
      content,
      title: deriveTitle(content),
      tags: extractTags(content),
    };
    await this.repository.put(note);
    return note.id;
  }
}

// Trasa /today: dnešní poznámka se najde nebo založí a otevře v editoru; při chybě nová poznámka
export const openToday: CanActivateFn = async () => {
  const router = inject(Router);
  try {
    return router.createUrlTree(['/note', await inject(DailyNote).open()]);
  } catch {
    return router.createUrlTree(['/new']);
  }
};
