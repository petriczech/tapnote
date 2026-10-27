import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { createNote, deriveTitle, extractTags, Note } from '../../core/model/note';
import { MAX_VERSIONS, VERSION_PAUSE_MS } from '../../core/model/note-version';
import { expandTemplate } from '../../core/model/template';
import { NotesRepository } from '../../core/storage/notes-repository';
import { FLUSH_EVENT } from '../../core/storage/flush-event';
import { VersionsRepository } from '../../core/storage/versions-repository';

export const RESUME_WINDOW_MS = 5 * 60 * 1000;
export const SAVE_DEBOUNCE_MS = 300;
// Ukazatel poslední editace obsahu
export const LAST_EDIT_KEY = 'tapnote.lastEdit';

interface LastEdit {
  id: string;
  editedAt: string;
}

function readLastEdit(): LastEdit | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_EDIT_KEY) ?? 'null');
    return typeof value === 'object' &&
      value !== null &&
      'id' in value &&
      typeof value.id === 'string' &&
      'editedAt' in value &&
      typeof value.editedAt === 'string'
      ? { id: value.id, editedAt: value.editedAt }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeLastEdit(lastEdit: LastEdit | undefined): void {
  try {
    if (lastEdit) {
      localStorage.setItem(LAST_EDIT_KEY, JSON.stringify(lastEdit));
    } else {
      localStorage.removeItem(LAST_EDIT_KEY);
    }
  } catch {
    // Bez úložiště se jen nepokračuje
  }
}

function withColor(note: Note, color: string | undefined): Note {
  return color === undefined ? note : { ...note, color };
}

@Injectable()
export class NoteDraft {
  private readonly repository = inject(NotesRepository);
  private readonly versions = inject(VersionsRepository);

  readonly content = signal('');
  readonly loading = signal(false);
  readonly saveFailed = signal(false);
  // Obsah je uložený (bez čekajících změn)
  readonly saved = signal(true);
  // Barva otevřené poznámky, u nové poznámky ze šablony barva šablony
  readonly color = signal<string | undefined>(undefined);
  // Id uložené poznámky (pro odkaz na historii)
  readonly noteId = signal<string | undefined>(undefined);
  // Uložená podoba poznámky pro meta řádek (kategorie, připnutí, poslední úprava)
  readonly stored = signal<Note | undefined>(undefined);
  // Otevřená poznámka se smazala nebo přesunula do koše jinde (jiné zařízení, jiná záložka)
  readonly removed = signal(false);

  private note: Note | undefined;
  // Poslední úprava textu otevřené poznámky; updatedAt mění i připnutí nebo barva
  private textEditedAt: string | undefined;
  // Obsah ze šablony, který se bez úpravy neukládá
  private prefill = '';
  private createdHere = false;
  private touched = false;
  // Vrácení z koše při psaní se uloží i se stejným textem
  private restored = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();
  private watching: Subscription | undefined;

  constructor() {
    // Před zavřením databáze (upgrade z jiné záložky) se uloží rozepsaný text
    const onFlush = (event: Event) => {
      if (event instanceof CustomEvent && Array.isArray(event.detail)) {
        event.detail.push(this.flush());
      }
    };
    addEventListener(FLUSH_EVENT, onFlush);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener(FLUSH_EVENT, onFlush);
      this.watching?.unsubscribe();
    });
  }

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

  // Nová poznámka z obsahu šablony; vrací pozici kurzoru, undefined = šablona není nebo už se píše
  async openTemplate(id: string): Promise<number | undefined> {
    const template = await this.repository.get(id).catch(() => undefined);
    if (!template?.isTemplate || template.deletedAt || this.touched || this.note) {
      return undefined;
    }
    const expanded = expandTemplate(template.content, new Date());
    this.prefill = expanded.content;
    this.content.set(expanded.content);
    this.color.set(template.color);
    this.saved.set(false);
    return expanded.cursor;
  }

  update(content: string): void {
    this.touched = true;
    this.content.set(content);
    this.saved.set(false);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.queue = this.queue.then(() => this.save());
    return this.queue;
  }

  // Akce mimo text (barva, připnutí, archiv…) po uložení rozepsaného textu; uložená poznámka se pak načte znovu,
  // aby ji další uložení textu nepřepsalo. Bez uložené poznámky se nic nemění.
  change(action: (note: Note) => Promise<void>): Promise<void> {
    const run = this.flush().then(async () => {
      if (!this.note) {
        return;
      }
      // Bez uloženého textu se akce neprovede
      if (this.saveFailed()) {
        throw new Error('Text není uložený');
      }
      await action(this.note);
      const note = await this.repository.get(this.note.id);
      if (note) {
        this.note = note;
        this.stored.set(note);
        this.color.set(note.color);
      }
    });
    // Chyba akce nezastaví další ukládání
    this.queue = run.catch(() => undefined);
    return run;
  }

  private load(note: Note): void {
    this.note = note;
    this.stored.set(note);
    // Známá je jen u naposledy psané poznámky, jinak se bere updatedAt
    const lastEdit = readLastEdit();
    this.textEditedAt = lastEdit?.id === note.id ? lastEdit.editedAt : note.updatedAt;
    this.noteId.set(note.id);
    this.content.set(note.content);
    this.color.set(note.color);
    this.watch(note.id);
  }

  // Uložená poznámka se sleduje, aby další uložení nepřepsalo novější verzi z jiného zařízení
  private watch(id: string): void {
    this.watching?.unsubscribe();
    this.watching = this.repository.watch(id).subscribe({
      // Ve frontě za ukládáním, aby se vlastní uložení nebo akce nebraly jako cizí změna
      next: (note) => void (this.queue = this.queue.then(() => this.receive(note)).catch(() => undefined)),
      error: () => undefined,
    });
  }

  // Novější verze se bez neuložených změn načte celá. Při psaní zůstane místní text, ale uloží se nad novější
  // verzí: její připnutí, kategorie a barva se zachovají a její text se uloží do historie.
  private receive(note: Note | undefined): void {
    const current = this.note;
    if (!current || (note && note.updatedAt <= current.updatedAt)) {
      return;
    }
    if (!this.saved()) {
      if (note) {
        const rebased: Note = { ...note };
        // Přesun do koše jinde je starší než místní psaní (novější vyhrává), proto psaní poznámku z koše vrátí
        this.restored ||= rebased.deletedAt !== undefined;
        delete rebased.deletedAt;
        // Cizí text se při dalším uložení uloží do historie bez ohledu na pauzu v psaní
        if (rebased.content !== current.content) {
          this.textEditedAt = undefined;
        }
        this.note = rebased;
        this.stored.set(rebased);
        this.color.set(rebased.color);
        this.createdHere = false;
      }
      return;
    }
    if (note && !note.deletedAt) {
      this.load(note);
      this.createdHere = false;
      return;
    }
    // Smazaná nebo vyhozená poznámka se zavře jako při otevření poznámky z koše
    this.watching?.unsubscribe();
    this.note = undefined;
    this.stored.set(undefined);
    this.noteId.set(undefined);
    this.content.set('');
    this.color.set(undefined);
    this.createdHere = false;
    this.removed.set(true);
  }

  // Úprava po pauze v psaní uloží předchozí znění jako verzi; chyba historie ukládání nezastaví
  private async keepVersion(now: string): Promise<void> {
    const previous = this.note;
    const edited = this.textEditedAt;
    if (!previous?.content.trim() || (edited !== undefined && Date.parse(now) - Date.parse(edited) < VERSION_PAUSE_MS)) {
      return;
    }
    await this.versions
      .add({ id: crypto.randomUUID(), noteId: previous.id, content: previous.content, createdAt: previous.updatedAt }, MAX_VERSIONS)
      .catch(() => undefined);
  }

  private async findResumable(): Promise<Note | undefined> {
    const lastEdit = readLastEdit();
    const age = lastEdit ? Date.now() - Date.parse(lastEdit.editedAt) : NaN;
    if (!lastEdit || !(age >= 0 && age < RESUME_WINDOW_MS)) {
      return undefined;
    }
    const note = await this.repository.get(lastEdit.id);
    return note && !note.deletedAt && !note.archived && !note.isTemplate ? note : undefined;
  }

  private async save(): Promise<void> {
    const content = this.content();
    try {
      if (this.restored || (this.note?.content ?? this.prefill) !== content) {
        await this.persist(content);
      }
      this.saveFailed.set(false);
      // Psaní během zápisu i neupravená šablona nechají stav neuložený
      this.saved.set(this.content() === content && (this.note !== undefined || content.trim() === ''));
    } catch {
      this.saveFailed.set(true);
    }
  }

  private async persist(content: string): Promise<void> {
    if (content.trim() === '' && (!this.note || this.createdHere)) {
      if (this.note) {
        await this.repository.delete(this.note.id);
        if (readLastEdit()?.id === this.note.id) {
          writeLastEdit(undefined);
        }
        await this.versions.deleteForNotes([this.note.id]).catch(() => undefined);
        this.watching?.unsubscribe();
        this.note = undefined;
        this.stored.set(undefined);
        this.noteId.set(undefined);
        this.createdHere = false;
      }
      return;
    }
    const now = new Date().toISOString();
    await this.keepVersion(now);
    const note: Note = {
      ...(this.note ?? withColor(createNote(crypto.randomUUID(), now), this.color())),
      content,
      title: deriveTitle(content),
      tags: extractTags(content),
      updatedAt: now,
    };
    await this.repository.put(note);
    writeLastEdit({ id: note.id, editedAt: now });
    const created = !this.note;
    this.createdHere ||= created;
    this.note = note;
    if (created) {
      this.watch(note.id);
    }
    this.stored.set(note);
    this.textEditedAt = now;
    this.noteId.set(note.id);
    this.prefill = '';
    this.restored = false;
  }
}
