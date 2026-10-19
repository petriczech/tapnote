import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Note } from '../../core/model/note';
import { collectTags, isNotesView, NotesView, queryNotes, snippet } from '../../core/model/note-query';
import { NoteActions } from '../../core/notes/note-actions';
import { NotesRepository } from '../../core/storage/notes-repository';

type NoteAction = 'pin' | 'archive' | 'unarchive' | 'trash' | 'restore' | 'delete';

const VIEWS: { view: NotesView; label: string; empty: string }[] = [
  { view: 'notes', label: 'Poznámky', empty: 'Zatím žádné poznámky' },
  { view: 'archive', label: 'Archiv', empty: 'Archiv je prázdný' },
  { view: 'trash', label: 'Koš', empty: 'Koš je prázdný' },
];

@Component({
  selector: 'tn-notes-list',
  imports: [RouterLink],
  template: `
    <header class="header">
      <h1 #heading tabindex="-1">{{ current().label }}</h1>
      <nav class="pills" aria-label="Pohledy">
        @for (item of views; track item.view) {
          <a
            routerLink="/notes"
            [queryParams]="{ view: item.view === 'notes' ? null : item.view }"
            [attr.aria-current]="item.view === current().view ? 'page' : null"
            >{{ item.label }}</a
          >
        }
      </nav>
      @if (tags().length > 0) {
        <nav class="pills" aria-label="Tagy">
          @for (name of tags(); track name) {
            <a
              routerLink="/notes"
              [queryParams]="{ view: viewParam(), tag: name === tag() ? null : name }"
              [attr.aria-current]="name === tag() ? 'true' : null"
              >#{{ name }}</a
            >
          }
        </nav>
      }
    </header>

    @if (current().view === 'trash') {
      <p class="hint">Poznámky v koši se po 30 dnech smažou.</p>
    }

    @if (actionFailed()) {
      <p class="error" role="alert">Akci se nepodařilo dokončit.</p>
    }

    @if (loadFailed()) {
      <p class="empty" role="alert">Poznámky se nepodařilo načíst.</p>
    } @else if (items().length === 0) {
      <p class="empty">{{ tag() ? 'Žádné poznámky s tagem #' + tag() : current().empty }}</p>
    } @else {
      <ul class="notes">
        @for (item of items(); track item.note.id) {
          <li [attr.data-id]="item.note.id">
            @if (current().view === 'trash') {
              <div class="body">
                <span class="title">{{ item.title }}</span>
                @if (item.snippet) {
                  <span class="snippet">{{ item.snippet }}</span>
                }
              </div>
            } @else {
              <a class="body" [routerLink]="['/note', item.note.id]">
                <span class="title">
                  @if (item.note.pinned) {
                    <span class="visually-hidden">Připnuto: </span><span aria-hidden="true">📌 </span>
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
              class="actions"
              [attr.popovertarget]="'menu-' + item.note.id"
              [attr.aria-label]="'Akce pro ' + item.title"
            >
              ⋮
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

    <a class="fab" routerLink="/new" aria-label="Nová poznámka">+</a>
  `,
  styles: `
    :host {
      display: block;
      padding: 0 1rem 6rem;
    }

    h1 {
      margin: 1rem 0 0.5rem;
      font-size: 1.5rem;
    }

    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .pills a {
      display: flex;
      align-items: center;
      min-height: 2.75rem;
      padding: 0 0.875rem;
      border-radius: 1.375rem;
      color: #1a56b8;
      text-decoration: none;
    }

    .pills a[aria-current] {
      background: #e8f0fe;
      font-weight: 600;
    }

    .hint,
    .empty {
      color: #555;
    }

    .error {
      color: #b00020;
    }

    .notes {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: flex;
      align-items: flex-start;
      border-bottom: 1px solid #ddd;
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
      padding: 0.75rem 0;
      color: inherit;
      text-decoration: none;
    }

    .title {
      font-weight: 600;
    }

    .snippet {
      display: -webkit-box;
      overflow: hidden;
      color: #555;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .note-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      color: #1a56b8;
      font-size: 0.875rem;
    }

    .actions {
      min-width: 2.75rem;
      min-height: 2.75rem;
      border: none;
      background: none;
      font-size: 1.25rem;
    }

    .menu {
      padding: 0.5rem;
      border: 1px solid #ccc;
      border-radius: 0.75rem;
      box-shadow: 0 4px 16px rgb(0 0 0 / 20%);
    }

    .menu button {
      display: block;
      width: 100%;
      min-width: 12rem;
      min-height: 2.75rem;
      padding: 0 1rem;
      border: none;
      background: none;
      font: inherit;
      text-align: left;
    }

    .fab {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 3.5rem;
      height: 3.5rem;
      border-radius: 50%;
      background: #1a56b8;
      color: #fff;
      font-size: 2rem;
      text-decoration: none;
    }

    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `,
})
export class NotesList implements OnInit {
  readonly view = input<string>();
  readonly tag = input<string>();

  private readonly repository = inject(NotesRepository);
  private readonly actions = inject(NoteActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('heading');

  protected readonly views = VIEWS;
  protected readonly notes = signal<Note[]>([]);
  protected readonly loadFailed = signal(false);

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
  protected readonly tags = computed(() => collectTags(this.notes(), this.current().view));
  protected readonly items = computed(() =>
    queryNotes(this.notes(), this.current().view, this.tag()).map((note) => ({
      note,
      title: note.title || 'Bez názvu',
      snippet: snippet(note.content),
    })),
  );

  ngOnInit(): Promise<void> {
    return this.load();
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
