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
import { collectTags, isNotesView, NotesView, queryNotes, snippet } from '../../core/model/note-query';
import { NoteActions } from '../../core/notes/note-actions';
import { createNoteSearch } from '../../core/search/note-search';
import { NotesRepository } from '../../core/storage/notes-repository';

export const URL_DEBOUNCE_MS = 300;

type NoteAction = 'pin' | 'archive' | 'unarchive' | 'trash' | 'restore' | 'delete';

const VIEWS: { view: NotesView; label: string; empty: string; icon: string }[] = [
  {
    view: 'notes',
    label: 'Poznámky',
    empty: 'Zatím žádné poznámky',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  },
  {
    view: 'archive',
    label: 'Archiv',
    empty: 'Archiv je prázdný',
    icon: 'm20.54 5.23-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.5c0-.48-.17-.93-.46-1.27zM12 17.5 6.5 12H10v-2h4v2h3.5L12 17.5zM5.12 5l.81-1h12l.94 1H5.12z',
  },
  {
    view: 'trash',
    label: 'Koš',
    empty: 'Koš je prázdný',
    icon: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  },
];

@Component({
  selector: 'tn-notes-list',
  imports: [RouterLink],
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
        <a class="icon-btn" routerLink="/settings" title="Nastavení" (click)="flushQuery()">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
            />
          </svg>
          <span class="visually-hidden">Nastavení</span>
        </a>
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
        <ul class="notes">
          @for (item of group.items; track item.note.id) {
            <li [attr.data-id]="item.note.id" [class.pinned]="item.note.pinned && current().view !== 'trash'">
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
                  <button type="button" (click)="run(item.note, 'trash', menu)">Smazat</button>
                }
              </div>
            </li>
          }
        </ul>
      }
    }

    <a class="fab" routerLink="/new" aria-label="Nová poznámka" (click)="flushQuery()">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" /></svg>
      Nová
    </a>

    <nav class="bottom-nav" aria-label="Pohledy">
      @for (item of views; track item.view) {
        <a
          routerLink="/notes"
          [queryParams]="{ view: item.view === 'notes' ? null : item.view, q: queryParam() }"
          [attr.aria-current]="item.view === current().view ? 'page' : null"
        >
          <span class="pill">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
          </span>
          {{ item.label }}
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      display: block;
      padding-top: env(safe-area-inset-top);
      padding-bottom: calc(10rem + env(safe-area-inset-bottom));
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
      font-size: 1.375rem;
      font-weight: 500;
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
      border-radius: var(--radius-l);
      background: var(--surface-high);
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
      border-radius: var(--radius-s);
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
      margin-bottom: 8px;
      padding-right: 4px;
      border: 1px solid var(--outline-variant);
      border-radius: var(--radius-m);
      background: var(--surface);
    }

    li.pinned {
      border-color: transparent;
      background: var(--surface-low);
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

    .menu button {
      display: block;
      width: 100%;
      min-width: 12rem;
      min-height: 48px;
      padding: 0 16px;
      border: none;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
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
      border-radius: var(--radius-m);
      background: var(--primary-container);
      color: var(--on-primary-container);
      font-weight: 600;
      text-decoration: none;
      box-shadow: 0 3px 8px rgb(0 0 0 / 25%);
    }

    .bottom-nav {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      justify-content: space-around;
      box-sizing: border-box;
      height: calc(80px + env(safe-area-inset-bottom));
      padding: 12px 0 env(safe-area-inset-bottom);
      background: var(--surface-low);
    }

    .bottom-nav a {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 80px;
      color: var(--on-surface-variant);
      font-size: 0.75rem;
      text-decoration: none;
    }

    .pill {
      display: flex;
      justify-content: center;
      width: 64px;
      padding: 4px 0;
      border-radius: 16px;
    }

    .bottom-nav a[aria-current] {
      color: var(--on-surface);
      font-weight: 600;
    }

    .bottom-nav a[aria-current] .pill {
      background: var(--primary-container);
      color: var(--on-primary-container);
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

  protected readonly views = VIEWS;
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
      (event.target as HTMLElement).querySelector('button')?.focus();
    }
  }

  protected async run(note: Note, action: NoteAction, menu: HTMLElement): Promise<void> {
    if (action === 'delete' && !confirm(`Smazat poznámku „${note.title || 'Bez názvu'}“ trvale?`)) {
      return;
    }
    menu.hidePopover?.();
    const index = this.items().findIndex((item) => item.note.id === note.id);
    this.actionFailed.set(false);
    try {
      await this.perform(note, action);
    } catch {
      this.actionFailed.set(true);
    }
    await this.load();
    afterNextRender(() => this.restoreFocus(note.id, index), { injector: this.injector });
  }

  private perform(note: Note, action: NoteAction): Promise<void> {
    switch (action) {
      case 'pin':
        return this.actions.togglePin(note);
      case 'archive':
      case 'unarchive':
        return this.actions.setArchived(note, action === 'archive');
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
  private restoreFocus(id: string, index: number): void {
    const items = [...this.host.querySelectorAll<HTMLElement>('li[data-id]')];
    const target = items.find((item) => item.dataset['id'] === id) ?? items[Math.min(index, items.length - 1)];
    (target?.querySelector<HTMLElement>('.actions') ?? this.heading().nativeElement).focus();
  }
}
