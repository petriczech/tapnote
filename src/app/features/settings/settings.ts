import { afterNextRender, Component, computed, ElementRef, inject, Injector, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  createExport,
  exportFileName,
  mergeNewer,
  parseExport,
  readLastBackup,
  writeLastBackup,
} from '../../core/backup/notes-backup';
import { loadBuildStamp } from '../../core/build-info';
import { Note } from '../../core/model/note';
import { templatesOf } from '../../core/model/note-query';
import { NoteActions } from '../../core/notes/note-actions';
import { readShortcutsEnabled, SHORTCUTS, writeShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { VersionsRepository } from '../../core/storage/versions-repository';
import { ICONS_REGULAR } from '../../core/icons/icons';
import { readTheme, THEMES } from '../../core/theme/theme';
import { BottomNav } from '../list/bottom-nav';
import { CategoriesSection } from './categories-section';

export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
const REVOKE_DELAY_MS = 60_000;

@Component({
  selector: 'tn-settings',
  imports: [BottomNav, CategoriesSection, RouterLink],
  template: `
    <header class="app-bar">
      <p class="eyebrow">Tapnote</p>
      <h1>Nastavení</h1>
    </header>

    <!-- Rozcestník: Vzhled je podstránka, ostatní řádky skočí na sekci níže (Kategorie dostanou vlastní obrazovku) -->
    <ul class="hub">
      <li>
        <a routerLink="/settings/vzhled">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.palette" /></svg>
          <span class="row-label">Vzhled</span>
          <span class="value">{{ themeLabel }}</span>
          <svg class="icon chev" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.caretRight" /></svg>
        </a>
      </li>
      @for (row of rows; track row.fragment) {
        <li>
          <a routerLink="/settings" [fragment]="row.fragment" (click)="focusSection(row.fragment)">
            <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons[row.icon]" /></svg>
            <span class="row-label">{{ row.label }}</span>
            <svg class="icon chev" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.caretRight" /></svg>
          </a>
        </li>
      }
    </ul>

    <tn-categories-section />

    <section aria-labelledby="templates-heading">
      <h2 id="templates-heading" tabindex="-1">Šablony</h2>
      @if (templates().length === 0) {
        <p class="info">Šablona se vytvoří z poznámky v seznamu přes nabídku ⋮ → Uložit jako šablonu.</p>
      } @else {
        <ul class="templates">
          @for (template of templates(); track template.id) {
            <li>
              <a class="template-title" [routerLink]="['/note', template.id]">{{ template.title || 'Bez názvu' }}</a>
              <span class="template-actions">
                <button
                  type="button"
                  class="text-btn"
                  [attr.aria-label]="'Vrátit mezi poznámky: ' + (template.title || 'Bez názvu')"
                  (click)="restoreTemplate(template)"
                >
                  Vrátit mezi poznámky
                </button>
                <button
                  type="button"
                  class="text-btn"
                  [attr.aria-label]="'Smazat: ' + (template.title || 'Bez názvu')"
                  (click)="deleteTemplate(template)"
                >
                  Smazat
                </button>
              </span>
            </li>
          }
        </ul>
      }
      <p class="info">{{ variablesHint }}</p>
    </section>

    <section aria-labelledby="backup-heading">
      <h2 id="backup-heading" tabindex="-1">Záloha</h2>
      <p class="info last-backup">Poslední záloha: {{ lastBackupText() }}</p>
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

    <section aria-labelledby="shortcuts-heading">
      <h2 id="shortcuts-heading" tabindex="-1">Klávesové zkratky</h2>
      <label class="check">
        <input #shortcutsBox type="checkbox" [checked]="shortcuts()" (change)="setShortcuts(shortcutsBox.checked)" />
        Zapnout klávesové zkratky
      </label>
      <table class="shortcuts">
        <thead>
          <tr>
            <th scope="col">Kde</th>
            <th scope="col">Klávesa</th>
            <th scope="col">Akce</th>
          </tr>
        </thead>
        <tbody>
          @for (item of shortcutList; track item.keys) {
            <tr>
              <td>{{ item.place }}</td>
              <td><kbd>{{ item.keys }}</kbd></td>
              <td>{{ item.label }}</td>
            </tr>
          }
        </tbody>
      </table>
    </section>

    <section aria-labelledby="about-heading">
      <h2 id="about-heading" tabindex="-1">O aplikaci</h2>
      <dl class="about">
        <dt>Verze</dt>
        <dd>{{ build() }}</dd>
      </dl>
    </section>

    <tn-bottom-nav current="settings" />
  `,
  styles: `
    :host {
      display: block;
      padding: env(safe-area-inset-top) 0 calc(7rem + env(safe-area-inset-bottom));
    }

    .app-bar {
      padding: 8px 16px 0;
    }

    h1 {
      margin: 0;
      font-family: var(--title-font);
      font-size: var(--title-size);
      font-weight: var(--title-weight);
      letter-spacing: var(--title-spacing);
    }

    // Rozcestník: skleněné řádky s ikonou, popiskem, hodnotou a šipkou
    .hub {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 16px 16px 24px;
      padding: 0;
      list-style: none;
    }

    .hub a {
      display: flex;
      align-items: center;
      gap: 14px;
      min-height: 56px;
      padding: 0 12px 0 16px;
      border: 1px solid var(--glass-border);
      border-radius: var(--card-radius);
      background: var(--glass);
      color: var(--on-surface);
      font-weight: 600;
      text-decoration: none;
    }

    .hub .icon {
      color: var(--primary);
    }

    .row-label {
      flex: 1;
    }

    .value {
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .hub .chev {
      width: 18px;
      height: 18px;
      color: var(--on-surface-variant);
    }

    // Sekce jako skleněné karty se záhlavím mono verzálkami
    section {
      margin: 0 16px 12px;
      padding: 4px 12px 12px;
      border: 1px solid var(--glass-border);
      border-radius: var(--card-radius);
      background: var(--glass);
    }

    h2 {
      margin: 14px 0 8px;
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    h2:focus:not(:focus-visible) {
      outline: none;
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
      border-radius: 14px;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    // Průhledný okraj se ve vysokém kontrastu vykreslí, přechod se tam zahodí
    .filled {
      border: 1px solid transparent;
      background: var(--grad);
      color: var(--on-grad);
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

    fieldset label,
    .check {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 48px;
    }

    fieldset input,
    .check input {
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

    .templates {
      margin: 0 0 8px;
      padding: 0;
      list-style: none;
    }

    .templates li {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 4px 8px;
      padding: 4px 0;
      border-bottom: 1px solid var(--outline-variant);
    }

    .template-title {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      color: var(--on-surface);
      font-weight: 600;
    }

    .template-actions {
      display: flex;
      gap: 4px;
    }

    .text-btn {
      min-height: 44px;
      padding: 0 12px;
      border: 0;
      border-radius: var(--radius-l);
      background: none;
      color: var(--primary);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }

    .shortcuts {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9375rem;
    }

    .shortcuts th,
    .shortcuts td {
      padding: 8px 8px 8px 0;
      border-bottom: 1px solid var(--outline-variant);
      text-align: left;
      vertical-align: top;
    }

    .shortcuts th {
      color: var(--on-surface-variant);
      font-weight: 600;
    }

    kbd {
      padding: 0 6px;
      border: 1px solid var(--outline);
      border-radius: 4px;
      font-family: inherit;
      white-space: nowrap;
    }

    .status {
      margin: 0 16px;
    }

    .status.error {
      color: var(--error);
    }

    .about {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      margin: 0;
    }

    .about dd {
      margin: 0;
      color: var(--on-surface-variant);
      font-family: var(--mono);
    }
  `,
})
export class Settings implements OnInit {
  private readonly repository = inject(NotesRepository);
  private readonly tasks = inject(TasksRepository);
  private readonly categories = inject(CategoriesRepository);
  private readonly versions = inject(VersionsRepository);
  private readonly actions = inject(NoteActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);

  protected readonly templates = signal<Note[]>([]);
  protected readonly build = signal('…');
  // Mimo šablonu komponenty, kde by se {{ }} vyhodnotilo
  protected readonly variablesHint = 'V textu šablony lze použít {{date}}, {{time}} a {{weekday}}; {{cursor}} označí místo kurzoru.';

  async ngOnInit(): Promise<void> {
    void loadBuildStamp().then((stamp) => this.build.set(stamp));
    await this.loadTemplates();
    // Odkaz se sekcí (zkratka ? ze seznamu → #shortcuts, Zálohovat → #backup) zaměří její nadpis až po načtení šablon, které ho jinak odsunou mimo obrazovku
    const fragment = this.route.snapshot.fragment;
    if (fragment) {
      afterNextRender(() => this.focusSection(fragment), { injector: this.injector });
    }
  }

  protected focusSection(fragment: string): void {
    document.getElementById(`${fragment}-heading`)?.focus();
  }

  protected async restoreTemplate(template: Note): Promise<void> {
    const index = this.templates().indexOf(template);
    await this.run(async () => {
      await this.actions.setTemplate(template, false);
      return 'Šablona je zpět mezi poznámkami.';
    }, 'Akci se nepodařilo dokončit.');
    this.keepFocus(index);
  }

  protected async deleteTemplate(template: Note): Promise<void> {
    const index = this.templates().indexOf(template);
    await this.run(async () => {
      if (!confirm(`Smazat šablonu „${template.title || 'Bez názvu'}“ trvale?`)) {
        return '';
      }
      await this.actions.deletePermanently(template);
      return 'Šablona je smazaná.';
    }, 'Akci se nepodařilo dokončit.');
    this.keepFocus(index);
  }

  // Když řádek s fokusem zmizel, fokus na šablonu na stejné pozici, jinak na nadpis sekce
  private keepFocus(index: number): void {
    afterNextRender(
      () => {
        if (this.host.contains(document.activeElement)) {
          return;
        }
        const links = this.host.querySelectorAll<HTMLElement>('.template-title');
        (links[Math.min(index, links.length - 1)] ?? this.host.querySelector<HTMLElement>('#templates-heading'))?.focus();
      },
      { injector: this.injector },
    );
  }

  protected readonly canShare = typeof navigator.canShare === 'function';
  protected readonly icons = ICONS_REGULAR;
  protected readonly themeLabel = THEMES.find((item) => item.id === readTheme())?.label;
  // Řádky rozcestníku s nadpisy sekcí; fragment + '-heading' je id nadpisu
  protected readonly rows = [
    { label: 'Kategorie', fragment: 'categories', icon: 'tag' },
    { label: 'Šablony', fragment: 'templates', icon: 'copy' },
    { label: 'Záloha', fragment: 'backup', icon: 'cloudArrowUp' },
    { label: 'Klávesové zkratky', fragment: 'shortcuts', icon: 'keyboard' },
    { label: 'O aplikaci', fragment: 'about', icon: 'info' },
  ] as const;
  private readonly lastBackup = signal(readLastBackup());
  protected readonly lastBackupText = computed(() => {
    const iso = this.lastBackup();
    return iso ? new Date(iso).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' }) : 'zatím žádná';
  });
  protected readonly mode = signal<'merge' | 'replace'>('merge');
  protected readonly busy = signal(false);
  protected readonly status = signal('');
  protected readonly failed = signal(false);

  protected readonly shortcutList = SHORTCUTS;
  protected readonly shortcuts = signal(readShortcutsEnabled());

  protected setShortcuts(enabled: boolean): void {
    writeShortcutsEnabled(enabled);
    this.shortcuts.set(enabled);
  }

  protected async exportNotes(target: 'download' | 'share'): Promise<void> {
    await this.run(async () => {
      const now = new Date();
      const data = {
        notes: await this.repository.getAll(),
        tasks: await this.tasks.getAll(),
        categories: await this.categories.getAll(),
      };
      const json = JSON.stringify(createExport(data, now), null, 2);
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
      // Úkoly se v hláškách zmíní, jen když nějaké jsou
      const withTasks = (text: string, count: number) => (count > 0 ? `${text}, úkolů: ${count}` : text);
      if (this.mode() === 'replace') {
        const notes = mergeNewer([], parsed.notes);
        const tasks = mergeNewer([], parsed.tasks);
        const categories = mergeNewer([], parsed.categories);
        if (notes.length === 0 && tasks.length === 0) {
          this.failed.set(true);
          return 'Záloha neobsahuje žádné poznámky.';
        }
        const currentNotes = await this.repository.getAll();
        const current = currentNotes.length;
        const currentTasks = (await this.tasks.getAll()).length;
        const question =
          currentTasks + tasks.length > 0
            ? `Smazat všechny současné poznámky (${current}) a úkoly (${currentTasks}) a nahradit je zálohou (poznámky ${notes.length}, úkoly ${tasks.length})?`
            : `Smazat všechny současné poznámky (${current}) a nahradit je poznámkami ze zálohy (${notes.length})?`;
        if (!confirm(question)) {
          return '';
        }
        // Záloha bez kategorií (třeba verze 1) současné kategorie nemaže
        if (categories.length > 0) {
          await this.categories.replaceAll(categories);
        }
        await this.tasks.replaceAll(tasks);
        await this.repository.replaceAll(notes);
        // Historie nahrazených poznámek se smaže
        const kept = new Set(notes.map((note) => note.id));
        await this.versions.deleteForNotes(currentNotes.filter((note) => !kept.has(note.id)).map((note) => note.id));
        return withTasks(`Obnoveno poznámek: ${notes.length}`, tasks.length);
      }
      const changed = mergeNewer(await this.repository.getAll(), parsed.notes);
      const changedTasks = mergeNewer(await this.tasks.getAll(), parsed.tasks);
      await this.categories.bulkPut(mergeNewer(await this.categories.getAll(), parsed.categories));
      await this.tasks.bulkPut(changedTasks);
      await this.repository.bulkPut(changed);
      return withTasks(`Přidáno nebo aktualizováno poznámek: ${changed.length}`, changedTasks.length);
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
      await this.loadTemplates();
    }
  }

  private async loadTemplates(): Promise<void> {
    try {
      this.templates.set(templatesOf(await this.repository.getAll()));
    } catch {
      // Seznam šablon zůstane, chyba akce se hlásí ve stavu
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
