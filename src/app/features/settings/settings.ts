import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  createExport,
  exportFileName,
  mergeNotes,
  parseExport,
  readLastBackup,
  writeLastBackup,
} from '../../core/backup/notes-backup';
import { NotesRepository } from '../../core/storage/notes-repository';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const REVOKE_DELAY_MS = 60_000;

@Component({
  selector: 'tn-settings',
  imports: [RouterLink],
  template: `
    <div class="toolbar">
      <a class="icon-btn" routerLink="/notes" title="Seznam">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        <span class="visually-hidden">Seznam</span>
      </a>
      <h1>Nastavení</h1>
    </div>

    <section aria-labelledby="backup-heading">
      <h2 id="backup-heading">Záloha</h2>
      <p class="info">Poslední záloha: {{ lastBackupText() }}</p>
      <div class="actions">
        <button type="button" class="filled" [attr.aria-disabled]="busy()" (click)="exportNotes('download')">Stáhnout zálohu</button>
        @if (canShare) {
          <button type="button" class="outlined" [attr.aria-disabled]="busy()" (click)="exportNotes('share')">Sdílet zálohu</button>
        }
      </div>
    </section>

    <section aria-labelledby="import-heading">
      <h2 id="import-heading">Obnovení ze zálohy</h2>
      <fieldset>
        <legend>Způsob obnovení</legend>
        <label>
          <input type="radio" name="mode" value="merge" [checked]="mode() === 'merge'" (change)="mode.set('merge')" />
          Sloučit – přidají se nové a novější poznámky
        </label>
        <label>
          <input type="radio" name="mode" value="replace" [checked]="mode() === 'replace'" (change)="mode.set('replace')" />
          Nahradit vše – současné poznámky se smažou
        </label>
      </fieldset>
      <label class="outlined file" [class.disabled]="busy()">
        Vybrat soubor zálohy
        <input #file type="file" accept="application/json,.json" [attr.aria-disabled]="busy()" (change)="importFile(file)" />
      </label>
    </section>

    <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
  `,
  styles: `
    :host {
      display: block;
      padding: env(safe-area-inset-top) 0 calc(2rem + env(safe-area-inset-bottom));
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 4px;
      min-height: 56px;
      padding: 0 4px;
    }

    h1 {
      margin: 0;
      font-size: 1.375rem;
      font-weight: 500;
    }

    section {
      margin: 8px 16px 24px;
    }

    h2 {
      margin: 0 0 8px;
      font-size: 1rem;
      font-weight: 600;
    }

    .info {
      margin: 0 0 12px;
      color: var(--on-surface-variant);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .filled,
    .outlined {
      display: inline-flex;
      align-items: center;
      min-height: 48px;
      padding: 0 24px;
      border-radius: var(--radius-l);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .filled {
      border: 0;
      background: var(--primary);
      color: var(--on-primary);
    }

    .outlined {
      border: 1px solid var(--outline);
      background: none;
      color: var(--primary);
    }

    [aria-disabled='true'],
    .disabled {
      opacity: 0.5;
      cursor: default;
    }

    fieldset {
      margin: 0 0 12px;
      padding: 0;
      border: 0;
    }

    legend {
      margin-bottom: 4px;
      padding: 0;
      color: var(--on-surface-variant);
    }

    fieldset label {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
    }

    fieldset input {
      flex: none;
      width: 20px;
      height: 20px;
      margin: 0;
      accent-color: var(--primary);
    }

    .file input {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
    }

    .file:focus-within {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    .status {
      margin: 0 16px;
    }

    .status.error {
      color: var(--error);
    }
  `,
})
export class Settings {
  private readonly repository = inject(NotesRepository);

  protected readonly canShare = typeof navigator.canShare === 'function';
  private readonly lastBackup = signal(readLastBackup());
  protected readonly lastBackupText = computed(() => {
    const iso = this.lastBackup();
    return iso ? new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }) : 'zatím žádná';
  });
  protected readonly mode = signal<'merge' | 'replace'>('merge');
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly failed = signal(false);

  protected async exportNotes(target: 'download' | 'share'): Promise<void> {
    await this.run(async () => {
      const now = new Date();
      const json = JSON.stringify(createExport(await this.repository.getAll(), now), null, 2);
      const file = new File([json], exportFileName(now), { type: 'application/json' });
      if (target === 'share') {
        if (!navigator.canShare({ files: [file] })) {
          return 'Sdílení souboru tady není dostupné, záloha se dá stáhnout.';
        }
        try {
          await navigator.share({ files: [file], title: 'Záloha Tapnote' });
        } catch (error) {
          // Zrušené sdílení není chyba ani záloha
          if (error instanceof DOMException && error.name === 'AbortError') {
            return '';
          }
          throw error;
        }
      } else {
        this.download(file);
      }
      writeLastBackup(now);
      this.lastBackup.set(now.toISOString());
      return 'Záloha je připravená.';
    }, 'Zálohu se nepodařilo vytvořit.');
  }

  protected async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    await this.run(async () => {
      if (file.size > MAX_IMPORT_BYTES) {
        this.failed.set(true);
        return 'Soubor je příliš velký.';
      }
      const parsed = parseExport(await file.text());
      if (!parsed.ok) {
        this.failed.set(true);
        return parsed.error === 'version' ? 'Záloha je z novější verze aplikace.' : 'Soubor není platná záloha Tapnote.';
      }
      if (this.mode() === 'replace') {
        const notes = mergeNotes([], parsed.notes);
        if (notes.length === 0) {
          this.failed.set(true);
          return 'Záloha neobsahuje žádné poznámky.';
        }
        const current = (await this.repository.getAll()).length;
        if (!confirm(`Smazat všechny současné poznámky (${current}) a nahradit je poznámkami ze zálohy (${notes.length})?`)) {
          return '';
        }
        await this.repository.replaceAll(notes);
        return `Obnoveno poznámek: ${notes.length}`;
      }
      const changed = mergeNotes(await this.repository.getAll(), parsed.notes);
      await this.repository.bulkPut(changed);
      return `Přidáno nebo aktualizováno poznámek: ${changed.length}`;
    }, 'Zálohu se nepodařilo obnovit.');
  }

  // Ovládání se při běhu nevypíná (fokus zůstane), opakovaná akce se jen ignoruje
  private async run(action: () => Promise<string>, failure: string): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.failed.set(false);
    this.status.set('');
    try {
      this.status.set(await action());
    } catch {
      this.failed.set(true);
      this.status.set(failure);
    } finally {
      this.busy.set(false);
    }
  }

  private download(file: File): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    // Safari a WebView čtou soubor až po kliknutí, proto se URL uvolní později
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}
