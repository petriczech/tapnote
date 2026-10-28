import { Service, signal } from '@angular/core';
import { Subject } from 'rxjs';

// Jak dlouho zůstává lišta Zpět vidět (bez fokusu a myši v ní)
export const UNDO_MS = 5000;

export interface UndoMessage {
  text: string;
  // Bez vrácení (hláška o chybě) je lišta bez tlačítka Zpět
  undo?: { id: string; run: () => Promise<unknown> };
}

// Lišta s tlačítkem Zpět po dokončení nebo smazání úkolu; nová zpráva nahradí předchozí
@Service()
export class Undo {
  readonly message = signal<UndoMessage | undefined>(undefined);
  // Id úkolu po úspěšném vrácení; seznam a detail ho načtou znovu a přesunou na něj fokus
  readonly undone = new Subject<string>();
  private timer?: ReturnType<typeof setTimeout>;

  show(text: string, id: string, run: () => Promise<unknown>): void {
    this.message.set({ text, undo: { id, run } });
    this.release();
  }

  hide(): void {
    clearTimeout(this.timer);
    this.message.set(undefined);
  }

  // S fokusem nebo myší v liště se neskryje
  hold(): void {
    clearTimeout(this.timer);
  }

  release(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.message.set(undefined), UNDO_MS);
  }

  // Vrácení je běžný zápis přes repozitář (nový updatedAt), takže ho převezme synchronizace i widget;
  // při chybě se nic nezměnilo, lišta místo zprávy ukáže chybu bez tlačítka
  async undo(): Promise<void> {
    const message = this.message();
    const undo = message?.undo;
    if (!undo) {
      return;
    }
    clearTimeout(this.timer);
    // Během zápisu zůstane jen text bez tlačítka, takže druhé stisknutí nic nespustí
    const pending = { text: message.text };
    this.message.set(pending);
    try {
      await undo.run();
      // Zpráva, která mezitím přišla (další úkol), zůstane
      if (this.message() === pending) {
        this.message.set(undefined);
      }
      this.undone.next(undo.id);
    } catch {
      this.message.set({ text: 'Změnu se nepodařilo uložit.' });
      this.release();
    }
  }
}
