import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { daysWithoutBackup, readLastBackup } from '../../core/backup/notes-backup';
import { Note } from '../../core/model/note';
import { collectTags, isNotesView, queryNotes, snippet, templatesOf } from '../../core/model/note-query';
import { NoteActions } from '../../core/notes/note-actions';
import { createNoteSearch } from '../../core/search/note-search';
import { NOTE_COLORS, NoteColor, noteColorVar } from '../../core/model/note-colors';
import { isPlainKey, readShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { NotesRepository } from '../../core/storage/notes-repository';
import { BottomNav } from './bottom-nav';
import { VIEWS } from './views';

export const URL_DEBOUNCE_MS = 300;

type NoteAction = 'pin' | 'archive' | 'unarchive' | 'template' | 'color' | 'trash' | 'restore' | 'delete';

// Rozložení seznamu v zařízení: 'grid' nebo 'list'
export const LAYOUT_KEY = 'tapnote.layout';

function readLayout(): string | null {
  try {
    return localStorage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
}

@Component({
  selector: 'tn-notes-list',
  host: { '[class.with-templates]': 'templates().length > 0', '(document:keydown)': 'onKey($event)' },
  imports: [RouterLink, BottomNav],
  template: `
    <header class="header">
      <div class="app-bar">
        <h1 #heading tabindex="-1">
          @if (current().view === 'notes') {
            Tapnote<span class="visually-hidden"> – {{ current().label }}</span>
          } @else {
            {{ current().label }}
          }
        </h1>
        <button
          type="button"
          class="icon-btn"
          title="Mřížka"
          [class.on]="grid()"
          [attr.aria-pressed]="grid()"
          (click)="toggleGrid()"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"
            />
          </svg>
          <span class="visually-hidden">Mřížka</span>
        </button>
      </div>
      <div role="search" class="search">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
          />
        </svg>
        <input
          #field
          type="search"
          aria-label="Hledat"
          placeholder="Hledat"
          [value]="query()"
          (input)="onQuery(field.value)"
          (keydown.escape)="onQuery('')"
        />
      </div>
      @if (tags().length > 0) {
        <nav class="chips" aria-label="Tagy">
          @for (name of tags(); track name) {
            <a
              routerLink="/notes"
              [queryParams]="{ view: viewParam(), tag: name === tag() ? null : name, q: queryParam() }"
              [attr.aria-current]="name === tag() ? 'true' : null"
              >#{{ name }}</a
            >
          }
        </nav>
      }
    </header>

    @if (backupDays(); as days) {
      <p class="backup">
        Bez zálohy {{ days }} dní
        <a routerLink="/settings" (click)="flushQuery()">Zálohovat</a>
      </p>
    }

    <p class="visually-hidden" aria-live="polite">{{ found() }}</p>

    @if (current().view === 'trash') {
      <p class="hint">Poznámky v koši se po 30 dnech smažou.</p>
    }

    @if (actionFailed()) {
      <p class="error" role="alert">Akci se nepodařilo dokončit.</p>
    }

    @if (loadFailed() || items().length === 0) {
      <div class="empty-state">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="current().icon" /></svg>
        @if (loadFailed()) {
          <p class="empty" role="alert">Poznámky se nepodařilo načíst.</p>
        } @else {
          <p class="empty">{{ queryParam() ? 'Nic nenalezeno pro „' + query().trim() + '“' : tag() ? 'Žádné poznámky s tagem #' + tag() : current().empty }}</p>
        }
      </div>
    } @else {
      @for (group of groups(); track group.label) {
        @if (group.label) {
          <h2 class="label">{{ group.label }}</h2>
        }
        <ul class="notes" [class.grid]="grid()">
          @for (item of group.items; track item.note.id) {
            <li
              [attr.data-id]="item.note.id"
              [class.pinned]="item.note.pinned && current().view !== 'trash'"
              [class.colored]="colorVar(item.note.color) !== null"
              [style.--note-bg]="colorVar(item.note.color)"
            >
              @if (current().view === 'trash') {
                <div class="body">
                  <span class="title">{{ item.title }}</span>
                  @if (item.snippet) {
                    <span class="snippet">{{ item.snippet }}</span>
                  }
                </div>
              } @else {
                <a class="body" [routerLink]="['/note', item.note.id]" (click)="flushQuery()">
                  <span class="title">
                    @if (item.note.pinned) {
                      <span class="visually-hidden">Připnuto: </span>
                      <svg class="icon pin" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M16 9V4h1a1 1 0 0 0 0-2H7a1 1 0 0 0 0 2h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"
                        />
                      </svg>
                    }
                    {{ item.title }}
                  </span>
                  @if (item.snippet) {
                    <span class="snippet">{{ item.snippet }}</span>
                  }
                  @if (item.note.tags.length > 0) {
                    <span class="note-tags">
                      @for (name of item.note.tags; track name) {
                        <span>#{{ name }}</span>
                      }
                    </span>
                  }
                </a>
              }
              <button
                type="button"
                class="icon-btn actions"
                [attr.popovertarget]="'menu-' + item.note.id"
                [attr.aria-label]="'Akce pro ' + item.title"
              >
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
                  />
                </svg>
              </button>
              <div #menu class="menu" popover [id]="'menu-' + item.note.id" (toggle)="onMenuToggle($event)">
                @if (current().view === 'trash') {
                  <button type="button" (click)="run(item.note, 'restore', menu)">Obnovit</button>
                  <button type="button" (click)="run(item.note, 'delete', menu)">Smazat trvale</button>
                } @else {
                  <button type="button" (click)="run(item.note, 'pin', menu)">
                    {{ item.note.pinned ? 'Odepnout' : 'Připnout' }}
                  </button>
                  @if (item.note.archived) {
                    <button type="button" (click)="run(item.note, 'unarchive', menu)">Vrátit z archivu</button>
                  } @else {
                    <button type="button" (click)="run(item.note, 'archive', menu)">Archivovat</button>
                  }
                  <button type="button" (click)="run(item.note, 'template', menu)">Uložit jako šablonu</button>
                  <button type="button" (click)="run(item.note, 'trash', menu)">Smazat</button>
                  <div class="swatches" role="group" aria-label="Barva">
                    <button
                      type="button"
                      class="swatch none"
                      aria-label="Bez barvy"
                      [attr.aria-pressed]="colorVar(item.note.color) === null"
                      (click)="run(item.note, 'color', menu)"
                    ></button>
                    @for (color of colors; track color.id) {
                      <button
                        type="button"
                        class="swatch"
                        [attr.aria-label]="color.label"
                        [attr.aria-pressed]="item.note.color === color.id"
                        [style.--swatch]="colorVar(color.id)"
                        (click)="run(item.note, 'color', menu, color.id)"
                      ></button>
                    }
                  </div>
                }
              </div>
            </li>
          }
        </ul>
      }
    }

    @if (templates().length > 0) {
      <button type="button" class="icon-btn from-template" popovertarget="templates-menu" title="Ze šablony">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 6H2v14a2 2 0 0 0 2 2h14v-2H4V6zm16-4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"
          />
        </svg>
        <span class="visually-hidden">Ze šablony</span>
      </button>
      <div id="templates-menu" class="menu" popover (toggle)="onMenuToggle($event)">
        @for (template of templates(); track template.id) {
          <a routerLink="/new" [queryParams]="{ template: template.id }" (click)="flushQuery()">{{
            template.title || 'Bez názvu'
          }}</a>
        }
      </div>
    }

    <a class="fab" routerLink="/new" aria-label="Nová poznámka" (click)="flushQuery()">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
      Nová
    </a>

    <tn-bottom-nav [current]="current().view" [q]="queryParam()" (leave)="flushQuery()" />
  `,
  styles: `
    :host {
      display: block;
      padding-top: env(safe-area-inset-top);
      padding-bottom: calc(10rem + env(safe-area-inset-bottom));
    }

    :host(.with-templates) {
      padding-bottom: calc(14rem + env(safe-area-inset-bottom));
    }

    .app-bar {
      display: flex;
      align-items: center;
      padding-right: 4px;
    }

    h1 {
      flex: 1;
      display: flex;
      align-items: center;
      min-height: 56px;
      margin: 0;
      padding: 0 16px;
      font-family: var(--title-font);
      font-size: var(--title-size);
      font-weight: var(--title-weight);
      letter-spacing: var(--title-spacing);
    }

    h1:focus:not(:focus-visible) {
      outline: none;
    }

    .search {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 52px;
      margin: 0 16px 12px;
      padding: 0 16px;
      border: 1px solid var(--search-border);
      border-radius: var(--search-radius);
      background: var(--search-bg);
      color: var(--on-surface-variant);
    }

    .search:focus-within {
      outline: 2px solid var(--primary);
    }

    .search input {
      flex: 1;
      min-width: 0;
      min-height: 44px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--on-surface);
      font: inherit;
    }

    .search input:focus {
      outline: none;
    }

    .search input::placeholder {
      color: var(--on-surface-variant);
    }

    .chips {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 0 16px 8px;
      scrollbar-width: none;
    }

    .chips a {
      display: inline-flex;
      flex: none;
      align-items: center;
      min-height: 32px;
      margin: 6px 0;
      padding: 0 12px;
      border: 1px solid var(--outline);
      border-radius: var(--chip-radius);
      color: var(--on-surface-variant);
      font-size: 0.875rem;
      text-decoration: none;
    }

    .chips a[aria-current] {
      border-color: transparent;
      background: var(--primary-container);
      color: var(--on-primary-container);
      font-weight: 600;
    }

    .backup {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin: 0 16px 12px;
      padding: 4px 4px 4px 16px;
      border-radius: var(--radius-m);
      background: var(--primary-container);
      color: var(--on-primary-container);
    }

    /* Prstenec fokusu v barvě textu banneru, primary na primary-container nemá kontrast */
    .backup a:focus-visible {
      outline-color: currentColor;
    }

    .backup a {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
      padding: 0 12px;
      color: inherit;
      font-weight: 600;
    }

    .hint,
    .error {
      margin: 0 16px 12px;
    }

    .hint {
      color: var(--on-surface-variant);
    }

    .error {
      color: var(--error);
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      margin-top: 96px;
      padding: 0 16px;
      text-align: center;
    }

    .empty-state .icon {
      width: 72px;
      height: 72px;
      color: var(--primary);
      opacity: 0.6;
    }

    .empty {
      margin: 0;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .label {
      margin: 12px 20px 8px;
      color: var(--on-surface-variant);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .notes {
      margin: 0;
      padding: 0 16px;
      list-style: none;
    }

    li {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin-bottom: var(--card-gap);
      padding-right: 4px;
      border: 1px solid var(--card-border);
      border-bottom-color: var(--card-divider, var(--card-border));
      border-radius: var(--card-radius);
      background: var(--card-bg);
      box-shadow: var(--card-shadow);
    }

    li.pinned {
      border-color: var(--card-pinned-border);
      border-bottom-color: var(--card-divider, var(--card-pinned-border));
      background: var(--card-pinned-bg);
    }

    /* Akcent na barevné kartě v barvě textu kvůli kontrastu */
    li.colored {
      --primary: var(--on-surface);
      border-color: transparent;
      background: var(--note-bg);
    }

    .notes.grid {
      column-count: 2;
      column-gap: 8px;
    }

    .notes.grid li {
      break-inside: avoid;
      margin-bottom: 8px;
    }

    .notes.grid .snippet {
      -webkit-line-clamp: 6;
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      padding: 12px 0 12px 16px;
      border-radius: var(--radius-m);
      color: inherit;
      text-decoration: none;
    }

    .title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: var(--title-font);
      font-weight: 600;
    }

    .title .pin {
      width: 18px;
      height: 18px;
      color: var(--pin);
    }

    .snippet {
      display: -webkit-box;
      overflow: hidden;
      color: var(--on-surface-variant);
      font-size: 0.9375rem;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .note-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 4px;
      color: var(--primary);
      font-size: 0.8125rem;
      font-weight: 500;
    }

    .actions {
      width: 44px;
      height: 44px;
      margin-top: 4px;
    }

    .menu {
      padding: 8px 0;
      border: 0;
      border-radius: var(--radius-s);
      background: var(--surface-high);
      color: var(--on-surface);
      box-shadow: 0 4px 16px rgb(0 0 0 / 25%);
    }

    .menu button,
    .menu a {
      display: flex;
      align-items: center;
      box-sizing: border-box;
      width: 100%;
      min-width: 12rem;
      min-height: 48px;
      padding: 0 16px;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      text-decoration: none;
    }

    .menu .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-width: 12rem;
      padding: 8px 12px 4px;
    }

    .menu .swatch {
      width: 40px;
      min-width: 0;
      height: 40px;
      min-height: 0;
      padding: 0;
      border: 1px solid var(--outline);
      border-radius: 50%;
      background: var(--swatch, var(--surface));
    }

    .menu .swatch.none {
      background: linear-gradient(135deg, transparent 46%, var(--outline) 46% 54%, transparent 54%), var(--surface);
    }

    .menu .swatch[aria-pressed='true'] {
      border: 3px solid var(--on-surface);
    }

    .from-template {
      position: fixed;
      right: 20px;
      bottom: calc(96px + 56px + 12px + env(safe-area-inset-bottom));
      background: var(--surface-high);
      color: var(--on-surface);
      box-shadow: 0 3px 8px rgb(0 0 0 / 25%);
    }

    .fab {
      position: fixed;
      right: 16px;
      bottom: calc(96px + env(safe-area-inset-bottom));
      display: inline-flex;
      align-items: center;
      gap: 12px;
      height: 56px;
      padding: 0 20px 0 16px;
      border-radius: var(--fab-radius);
      background: var(--fab-bg);
      color: var(--fab-text);
      font-weight: 600;
      text-decoration: none;
      box-shadow: 0 3px 8px rgb(0 0 0 / 25%);
    }
  `,
})
export class NotesList implements OnInit {
  readonly view = input<string>();
  readonly tag = input<string>();
  readonly q = input<string>();

  private readonly repository = inject(NotesRepository);
  private readonly actions = inject(NoteActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private urlTimer?: ReturnType<typeof setTimeout>;
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly notes = signal<Note[]>([]);
  protected readonly loadFailed = signal(false);
  // Text pole hledání, do URL se zapisuje se zpožděním
  protected readonly query = signal('');

  protected readonly current = computed(() => {
    const view = this.view();
    return VIEWS.find((item) => item.view === (isNotesView(view) ? view : 'notes')) ?? VIEWS[0];
  });
  // Hláška o chybě akce do změny pohledu nebo tagu
  protected readonly actionFailed = linkedSignal({
    source: () => `${this.current().view}|${this.tag() ?? ''}`,
    computation: () => false,
  });
  protected readonly viewParam = computed(() => (this.current().view === 'notes' ? null : this.current().view));
  protected readonly queryParam = computed(() => (this.query().trim() ? this.query() : null));
  // Připomínka zálohy jen v poznámkách
  protected readonly backupDays = computed(() =>
    this.current().view === 'notes' ? daysWithoutBackup(readLastBackup(), this.notes(), new Date()) : undefined,
  );
  protected readonly tags = computed(() => collectTags(this.notes(), this.current().view));
  protected readonly templates = computed(() => templatesOf(this.notes()));
  protected readonly colors = NOTE_COLORS;
  protected readonly colorVar = noteColorVar;
  protected readonly grid = signal(readLayout() === 'grid');
  private readonly search = computed(() => createNoteSearch(this.notes()));
  protected readonly items = computed(() => {
    const notes = queryNotes(this.notes(), this.current().view, this.tag());
    const query = this.queryParam();
    return (query ? this.search()(query, notes) : notes).map((note) => ({
      note,
      title: note.title || 'Bez názvu',
      snippet: snippet(note.content),
    }));
  });
  // Připnuté zvlášť, jen v poznámkách bez hledání (výsledky drží pořadí podle relevance)
  protected readonly groups = computed(() => {
    const items = this.items();
    const pinned = items.filter((item) => item.note.pinned);
    if (this.current().view !== 'notes' || this.queryParam() || pinned.length === 0) {
      return [{ label: '', items }];
    }
    return [
      { label: 'Připnuté', items: pinned },
      { label: 'Ostatní', items: items.filter((item) => !item.note.pinned) },
    ].filter((group) => group.items.length > 0);
  });
  protected readonly found = computed(() => {
    if (!this.queryParam() || this.loadFailed()) {
      return '';
    }
    const count = this.items().length;
    if (count === 1) {
      return 'Nalezena 1 poznámka';
    }
    return count >= 2 && count <= 4 ? `Nalezeny ${count} poznámky` : `Nalezeno ${count} poznámek`;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.urlTimer));
  }

  ngOnInit(): Promise<void> {
    this.query.set(this.q() ?? '');
    return this.load();
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.urlTimer);
    this.urlTimer = setTimeout(
      () => this.router.navigate([], { ...this.queryUrlOptions(), replaceUrl: true }),
      URL_DEBOUNCE_MS,
    );
  }

  // Nezapsané hledání se před odchodem uloží do aktuální položky historie
  protected flushQuery(): void {
    clearTimeout(this.urlTimer);
    this.location.replaceState(this.router.createUrlTree([], this.queryUrlOptions()).toString());
  }

  private queryUrlOptions() {
    return { relativeTo: this.route, queryParams: { q: this.queryParam() }, queryParamsHandling: 'merge' as const };
  }

  // Fokus na první akci otevřené nabídky
  protected onMenuToggle(event: Event): void {
    if ('newState' in event && event.newState === 'open') {
      (event.target as HTMLElement).querySelector<HTMLElement>('button, a')?.focus();
    }
  }

  protected toggleGrid(): void {
    this.grid.update((grid) => !grid);
    try {
      localStorage.setItem(LAYOUT_KEY, this.grid() ? 'grid' : 'list');
    } catch {
      // Bez úložiště platí rozložení jen do zavření
    }
  }

  // Zkratky seznamu; akce f, e, # platí pro poznámku s fokusem
  protected onKey(event: KeyboardEvent): void {
    if (!readShortcutsEnabled() || !isPlainKey(event)) {
      return;
    }
    const item = document.activeElement?.closest<HTMLElement>('li[data-id]') ?? undefined;
    const note = this.notes().find((note) => note.id === item?.dataset['id']);
    switch (event.key) {
      case 'c':
        this.flushQuery();
        void this.router.navigate(['/new']);
        break;
      case '/':
        this.field().nativeElement.focus();
        break;
      case 'j':
      case 'k':
        this.moveFocus(item, event.key === 'j' ? 1 : -1);
        break;
      case '?':
        this.flushQuery();
        void this.router.navigate(['/settings'], { fragment: 'shortcuts' });
        break;
      case 'f':
      case 'e':
      case '#': {
        const menu = item?.querySelector<HTMLElement>('.menu');
        // Podržená klávesa akci neopakuje
        if (!note || !menu || event.repeat || this.current().view === 'trash') {
          return;
        }
        const action = event.key === 'f' ? 'pin' : event.key === '#' ? 'trash' : note.archived ? 'unarchive' : 'archive';
        void this.run(note, action, menu);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  // Bez vybrané poznámky j začne první a k poslední
  private moveFocus(item: HTMLElement | undefined, step: number): void {
    const items = [...this.host.querySelectorAll<HTMLElement>('li[data-id]')];
    const index = item ? items.indexOf(item) + step : step > 0 ? 0 : items.length - 1;
    items[Math.max(0, Math.min(index, items.length - 1))]?.querySelector<HTMLElement>('a.body, .actions')?.focus();
  }

  protected async run(note: Note, action: NoteAction, menu: HTMLElement, color?: NoteColor): Promise<void> {
    if (action === 'delete' && !confirm(`Smazat poznámku „${note.title || 'Bez názvu'}“ trvale?`)) {
      return;
    }
    menu.hidePopover?.();
    // Po akci ze zkratky se fokus vrátí na odkaz poznámky, jinak na ⋮
    const focusLink = document.activeElement?.matches('a.body') ?? false;
    const index = this.items().findIndex((item) => item.note.id === note.id);
    this.actionFailed.set(false);
    try {
      await this.perform(note, action, color);
    } catch {
      this.actionFailed.set(true);
    }
    await this.load();
    afterNextRender(() => this.restoreFocus(note.id, index, focusLink), { injector: this.injector });
  }

  private perform(note: Note, action: NoteAction, color?: NoteColor): Promise<void> {
    switch (action) {
      case 'pin':
        return this.actions.togglePin(note);
      case 'archive':
      case 'unarchive':
        return this.actions.setArchived(note, action === 'archive');
      case 'template':
        return this.actions.setTemplate(note, true);
      case 'color':
        return this.actions.setColor(note, color);
      case 'trash':
        return this.actions.trash(note);
      case 'restore':
        return this.actions.restore(note);
      case 'delete':
        return this.actions.deletePermanently(note);
    }
  }

  private async load(): Promise<void> {
    try {
      this.notes.set(await this.repository.getAll());
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    }
  }

  // Fokus na tutéž poznámku, jinak na položku na stejné pozici, jinak na nadpis
  private restoreFocus(id: string, index: number, focusLink: boolean): void {
    const items = [...this.host.querySelectorAll<HTMLElement>('li[data-id]')];
    const target = items.find((item) => item.dataset['id'] === id) ?? items[Math.min(index, items.length - 1)];
    (target?.querySelector<HTMLElement>(focusLink ? 'a.body, .actions' : '.actions') ?? this.heading().nativeElement).focus();
  }
}
