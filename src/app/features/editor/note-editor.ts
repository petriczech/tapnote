import {
  afterNextRender,
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Category } from '../../core/model/category';
import { categoryIconPath } from '../../core/model/category-icons';
import { continueList, hasChecklist, moveGroup, TextEdit, toggleItem, toggleItemPrefix } from '../../core/model/checklist';
import { backlinks, extractLinks, linkTargets } from '../../core/model/links';
import { deriveTitle, Note } from '../../core/model/note';
import { isNoteColor, NOTE_COLORS, noteColorVar } from '../../core/model/note-colors';
import { localDate } from '../../core/model/task-query';
import { NoteActions } from '../../core/notes/note-actions';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { readShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { Split } from '../list/split';
import { NoteDraft } from './note-draft';
import { NoteView } from './note-view';
import { ICONS_FILL, ICONS_REGULAR } from '../../core/icons/icons';

type EditorAction = 'pin' | 'archive' | 'template' | 'trash' | 'color' | 'category';

@Component({
  selector: 'tn-note-editor',
  imports: [NoteView, RouterLink],
  providers: [NoteDraft],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pagehide)': 'draft.flush()',
    '(document:keydown)': 'onKey($event)',
    '[style.--note-bg]': 'noteBg()',
    '[class.colored]': 'noteBg() !== null',
  },
  template: `
    <!-- Horní lišta jako obrazovka 03 návrhu D: zpět, Uloženo, vpravo přechodové tlačítko -->
    <div class="toolbar">
      <a class="icon-btn" routerLink="/notes" queryParamsHandling="preserve" [state]="back()" title="Seznam">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.back" /></svg>
        <span class="visually-hidden">Seznam</span>
      </a>
      @if (shortcuts) {
        <kbd class="key-hint" aria-hidden="true">Esc</kbd>
      }
      @if (draft.content().trim() && draft.saved()) {
        <span class="saved"><span class="dot" aria-hidden="true"></span>Uloženo</span>
      }
      <span class="actions">
        @if (mode() === 'edit') {
          <button type="button" class="tool grad" (click)="setMode('view')">
            Hotovo
            @if (shortcuts) {
              <kbd class="key-hint" aria-hidden="true">Ctrl + Enter</kbd>
            }
          </button>
        } @else {
          <button #editButton type="button" class="tool grad" (click)="setMode('edit')">
            <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.pencil" /></svg>
            Upravit
            @if (shortcuts) {
              <kbd class="key-hint" aria-hidden="true">Ctrl + Enter</kbd>
            }
          </button>
        }
      </span>
    </div>
    @if (mode() === 'edit') {
      <textarea
        #textarea
        class="editor"
        aria-label="Poznámka"
        placeholder="Začněte psát…"
        [value]="draft.content()"
        [readOnly]="draft.loading()"
        (input)="draft.update(textarea.value)"
        (keydown.enter)="onEnter($event)"
      ></textarea>
    } @else {
      <tn-note-view
        class="view"
        [content]="draft.content()"
        [targets]="targets()"
        (itemToggle)="toggleItem($event)"
        (itemMove)="moveItem($event)"
        (addItem)="addItem($event)"
      >
        @if (draft.stored(); as note) {
          <div class="meta">
            @if (category(); as cat) {
              <span class="pill" [style.--cat]="'var(--c-' + cat.color + ')'">
                <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(cat.icon)" /></svg>
                {{ cat.name }}
              </span>
            }
            @if (note.pinned) {
              <span class="pill">
                <svg class="icon pin" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsFill.pin" /></svg>
                Připnuto
              </span>
            }
            <time class="pill" [attr.datetime]="note.updatedAt">upraveno {{ edited() }}</time>
          </div>
        }
      </tn-note-view>
    }
    @if (backlinks().length > 0) {
      <nav class="backlinks" aria-labelledby="backlinks-heading">
        <h2 id="backlinks-heading">Odkazuje sem</h2>
        <ul>
          @for (note of backlinks(); track note.id) {
            <li><a [routerLink]="['/note', note.id]">{{ note.title || 'Bez názvu' }}</a></li>
          }
        </ul>
      </nav>
    }
    <!-- Spodní panel nástrojů jako obrazovka 03 návrhu D, jen s existujícími akcemi; prostá skupina tlačítek v pořadí Tab -->
    <div class="format" role="group" aria-label="Formát">
      @if (mode() === 'edit') {
        <button type="button" class="icon-btn" title="Checklist" (pointerdown)="$event.preventDefault()" (click)="toggleChecklistLine()">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.checklist" /></svg>
          <span class="visually-hidden">Checklist</span>
          @if (shortcuts) {
            <kbd class="key-hint" aria-hidden="true">Ctrl + Shift + L</kbd>
          }
        </button>
      }
      <button type="button" class="icon-btn" title="Tag" (pointerdown)="$event.preventDefault()" (click)="insertTag()">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.tag" /></svg>
        <span class="visually-hidden">Tag</span>
      </button>
      <button type="button" class="icon-btn" title="Barva" popovertarget="color-menu">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.palette" /></svg>
        <span class="visually-hidden">Barva</span>
      </button>
      @if (draft.stored()) {
        <button type="button" class="icon-btn" title="Další akce" popovertarget="more-menu">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.more" /></svg>
          <span class="visually-hidden">Další akce</span>
        </button>
      }
    </div>
    <div #colorMenu id="color-menu" class="menu format-menu" popover (toggle)="onMenuToggle($event)">
      <div class="swatches" role="group" aria-label="Barva">
        <button type="button" class="swatch none" aria-label="Bez barvy" [attr.aria-pressed]="noteBg() === null" (click)="run(colorMenu, 'color')"></button>
        @for (color of colors; track color.id) {
          <button
            type="button"
            class="swatch"
            [attr.aria-label]="color.label"
            [attr.aria-pressed]="draft.color() === color.id"
            [style.--swatch]="colorVar(color.id)"
            (click)="run(colorMenu, 'color', color.id)"
          ></button>
        }
      </div>
    </div>
    <!-- Akce jako v nabídce ⋮ seznamu (stejné popisky, Smazat do koše bez potvrzení) -->
    @if (draft.stored(); as note) {
      <div #moreMenu id="more-menu" class="menu format-menu" popover (toggle)="onMenuToggle($event)">
        <a [routerLink]="['/note', note.id, 'history']">Historie</a>
        <button type="button" (click)="run(moreMenu, 'pin')">{{ note.pinned ? 'Odepnout' : 'Připnout' }}</button>
        <button type="button" (click)="run(moreMenu, 'archive')">{{ note.archived ? 'Vrátit z archivu' : 'Archivovat' }}</button>
        @if (!note.isTemplate) {
          <button type="button" (click)="run(moreMenu, 'template')">Uložit jako šablonu</button>
        }
        <button type="button" (click)="run(moreMenu, 'trash')">Smazat</button>
        @if (categories().length > 0) {
          <div class="menu-categories" role="group" aria-label="Kategorie">
            @for (cat of categories(); track cat.id) {
              <button
                type="button"
                [style.--cat]="'var(--c-' + cat.color + ')'"
                [attr.aria-pressed]="note.categoryId === cat.id"
                (click)="run(moreMenu, 'category', note.categoryId === cat.id ? undefined : cat.id)"
              >
                <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(cat.icon)" /></svg>
                {{ cat.name }}
              </button>
            }
          </div>
        }
      </div>
    }
    <p class="status" aria-live="polite">
      @if (draft.saveFailed()) {
        Neuloženo
      } @else if (actionFailed()) {
        Akci se nepodařilo dokončit.
      }
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100dvh;
      /* Místo pro spodní panel nástrojů, obsah ani fokus pod ním nezmizí (WCAG 2.4.11) */
      padding-bottom: calc(88px + env(safe-area-inset-bottom));
      background: var(--note-bg, var(--editor-bg));
    }

    /* Akcent a fajfka na barevném pozadí v barvě textu kvůli kontrastu */
    :host(.colored) {
      --primary: var(--on-surface);
      --check-fill: var(--on-surface);
      --outline: var(--on-surface-variant);
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 64px;
      padding: env(safe-area-inset-top) 12px 0;
    }

    .actions {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }

    .toolbar .icon-btn,
    .tool {
      box-sizing: border-box;
      flex: none;
      height: var(--target);
      border: 1px solid var(--glass-border);
      border-radius: 14px;
      background: var(--glass);
      color: var(--on-surface);
    }

    .toolbar .icon-btn {
      width: var(--target);
    }

    .tool {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 14px;
      font: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
    }

    .tool .icon {
      width: 20px;
      height: 20px;
    }

    .tool.grad {
      border-color: transparent;
      background: var(--grad);
      color: var(--on-grad);
      font-weight: 600;
    }

    .saved {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding-left: 4px;
      overflow: hidden;
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
      white-space: nowrap;
    }

    .dot {
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--c-green);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-green) 25%, transparent);
    }

    @media (width < 412px) {
      .toolbar,
      .actions {
        gap: 4px;
      }

      .toolbar {
        padding-inline: 8px;
      }
    }

    /* Plovoucí panel jako spodní lišta seznamů; sklo a rozostření dávají tokeny jen Noiru, jinde plná plocha */
    .format {
      position: fixed;
      right: 12px;
      bottom: calc(14px + env(safe-area-inset-bottom));
      left: 12px;
      display: flex;
      justify-content: space-around;
      box-sizing: border-box;
      max-width: 560px;
      min-height: 60px;
      margin: 0 auto;
      padding: 5px 8px;
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-l);
      background: var(--glass-strong);
      backdrop-filter: var(--glass-blur);
      box-shadow: var(--card-shadow);
    }

    .format .icon-btn {
      color: var(--on-surface);
    }

    /* Nabídky panelu vpravo nad ním, na dosah palce */
    .format-menu {
      inset: auto 12px calc(88px + env(safe-area-inset-bottom)) auto;
      max-height: calc(100dvh - 120px);
      margin: 0;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 0 10px;
      border: 1px solid var(--glass-border);
      border-radius: 999px;
      background: var(--glass);
      color: var(--on-surface-variant);
      font-family: var(--font);
      font-size: 0.8125rem;
      font-weight: 500;
      line-height: 1.2;
    }

    .pill .icon {
      width: 16px;
      height: 16px;
      color: var(--cat, currentColor);
    }

    .pill .pin {
      color: var(--pin);
    }

    .view {
      flex: 1;
      overflow: auto;
    }

    .editor {
      flex: 1;
      padding: 8px 22px;
      border: none;
      resize: none;
      background: var(--editor-lines) 0 8px / 100% auto local;
      color: inherit;
      font: inherit;
      font-family: var(--editor-font);
      font-size: 1.0625rem;
      line-height: 1.55;
    }

    .editor::placeholder {
      color: var(--on-surface-variant);
    }

    .editor:focus {
      outline: none;
    }

    .editor:focus-visible {
      outline: 2px solid var(--ring);
      outline-offset: -2px;
    }

    /* Zpětné odkazy ve skleněné kartě s nadpisem v Geist Mono */
    .backlinks {
      max-height: 40dvh;
      overflow: auto;
      margin: 8px 16px 12px;
      padding: 10px 16px 0;
      border: 1px solid var(--glass-border);
      border-radius: 20px;
      background: var(--glass);
    }

    .backlinks h2 {
      margin: 0;
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .backlinks ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .backlinks li + li {
      border-top: 1px solid var(--outline-variant);
    }

    .backlinks a {
      display: flex;
      align-items: center;
      min-height: 48px;
      color: var(--primary);
      font-weight: 500;
    }

    .status {
      position: fixed;
      right: 1rem;
      bottom: calc(92px + env(safe-area-inset-bottom));
      margin: 0;
      color: var(--error);
    }

    /* Od 900 px čtecí šířka 720 px na střed (posuvník a pozadí zůstávají přes celé okno) a volnější řádkování */
    @media (min-width: 900px) {
      .toolbar {
        padding-inline: max(12px, calc(50% - 348px));
      }

      .editor,
      .view {
        padding-inline: max(22px, calc(50% - 338px));
        line-height: 1.65;
      }

      .backlinks {
        margin-inline: max(16px, calc(50% - 360px));
      }

      /* Panel jen na šířku tlačítek s viditelnými popisky (ze skrytého textu), dole ve sloupci editoru;
         všechna čtyři tlačítka se vejdou i do nejužšího sloupce vedle seznamu (604 px na 1200 px) */
      .format {
        justify-content: center;
        gap: 4px;
        width: fit-content;
        max-width: none;
      }

      .format .icon-btn {
        gap: 8px;
        width: auto;
        padding: 0 10px;
        border-radius: 12px;
        font: inherit;
        font-size: 0.875rem;
        font-weight: 600;
      }

      .format .visually-hidden {
        position: static;
        width: auto;
        height: auto;
        clip-path: none;
      }
    }

    /* Ve vysokém kontrastu se přechod zahodí, tlačítko proto dostane obrys */
    @media (forced-colors: active) {
      .tool.grad {
        border-color: ButtonText;
      }
    }
  `,
})
export class NoteEditor implements OnInit {
  protected readonly iconsFill = ICONS_FILL;
  protected readonly iconsRegular = ICONS_REGULAR;
  protected readonly iconPath = categoryIconPath;
  readonly id = input<string>();
  readonly resume = input(false, { transform: booleanAttribute });
  // Id šablony pro novou poznámku (/new?template=…)
  readonly template = input<string>();

  protected readonly draft = inject(NoteDraft);
  private readonly repository = inject(NotesRepository);
  private readonly categoriesRepository = inject(CategoriesRepository);
  private readonly router = inject(Router);
  private readonly actions = inject(NoteActions);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');
  // Vedle seznamu (od 1200 px) si návrat na seznam nese id poznámky pro fokus na její kartu
  private readonly split = inject(Split, { optional: true });
  protected readonly back = computed(() => (this.split?.wide() ? { focus: this.draft.noteId() } : undefined));

  protected readonly mode = signal<'edit' | 'view'>('edit');
  protected readonly actionFailed = signal(false);
  // Štítky Esc a Ctrl + Enter jen se zapnutými zkratkami
  protected readonly shortcuts = readShortcutsEnabled();
  protected readonly colors = NOTE_COLORS;
  protected readonly colorVar = noteColorVar;
  protected readonly noteBg = computed(() => noteColorVar(this.draft.color()));
  // Ostatní poznámky pro [[odkazy]] a „Odkazuje sem“, načtené při otevření editoru
  private readonly notes = signal<Note[]>([]);
  protected readonly targets = computed(() => linkTargets(this.notes()));
  // Název se odvozuje zvlášť, aby se zpětné odkazy nepřepočítávaly při každém stisku klávesy
  private readonly title = computed(() => deriveTitle(this.draft.content()));
  protected readonly backlinks = computed(() => {
    const id = this.draft.noteId();
    return id === undefined ? [] : backlinks(this.notes(), { id, title: this.title() });
  });
  // Kategorie pro meta řádek; neznámé id (smazaná kategorie) se nezobrazí
  private readonly categories = signal<Category[]>([]);
  protected readonly category = computed(() => this.categories().find((item) => item.id === this.draft.stored()?.categoryId));
  // Dnešek pro „upraveno 9:38“ (jindy datum), přepočítává se o půlnoci a po návratu do aplikace
  private readonly today = signal(localDate(new Date()));
  private midnightTimer?: ReturnType<typeof setTimeout>;
  protected readonly edited = computed(() => {
    const iso = this.draft.stored()?.updatedAt;
    if (iso === undefined) {
      return '';
    }
    const at = new Date(iso);
    const date = localDate(at);
    const today = this.today();
    if (date === today) {
      return `${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`;
    }
    const [year, month, day] = date.split('-').map(Number);
    return `${day}. ${month}.${year === Number(today.slice(0, 4)) ? '' : ` ${year}`}`;
  });

  constructor() {
    afterNextRender(() => this.textarea()?.nativeElement.focus());
    // Seznam vedle editoru se obnoví po uložení (nová poznámka, název, připnutí) i po zavření editoru a označí otevřenou poznámku
    effect(() => {
      this.split?.openId.set(this.draft.stored()?.id);
      this.split?.saves.update((count) => count + 1);
    });
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.midnightTimer);
      void this.draft.flush().then(() => this.split?.saves.update((count) => count + 1));
    });
  }

  async ngOnInit(): Promise<void> {
    this.refreshToday();
    void this.repository
      .getAll()
      .then((notes) => this.notes.set(notes))
      .catch(() => undefined);
    void this.categoriesRepository
      .getAll()
      .then((categories) => this.categories.set(categories))
      .catch(() => undefined);
    const template = this.template();
    if (this.id() === undefined && template !== undefined) {
      const cursor = await this.draft.openTemplate(template);
      if (cursor !== undefined) {
        afterNextRender(
          () => {
            const textarea = this.textarea()?.nativeElement;
            textarea?.focus();
            textarea?.setSelectionRange(cursor, cursor);
          },
          { injector: this.injector },
        );
      }
      return;
    }
    const opened = await this.draft.open(this.id(), this.resume());
    if (!opened && !this.destroyRef.destroyed) {
      await this.router.navigate(['/new'], { replaceUrl: true });
    } else if (this.id() !== undefined && (hasChecklist(this.draft.content()) || extractLinks(this.draft.content()).length > 0)) {
      this.setMode('view');
    }
  }

  protected setMode(mode: 'edit' | 'view'): void {
    this.mode.set(mode);
    afterNextRender(
      () => (mode === 'edit' ? this.textarea() : this.editButton())?.nativeElement.focus(),
      { injector: this.injector },
    );
  }

  protected onEnter(event: Event): void {
    const textarea = this.textarea()?.nativeElement;
    if (!textarea || !(event instanceof KeyboardEvent) || event.shiftKey || event.isComposing) {
      return;
    }
    if (textarea.selectionStart !== textarea.selectionEnd) {
      return;
    }
    const edit = continueList(textarea.value, textarea.selectionStart);
    if (edit) {
      event.preventDefault();
      this.apply(textarea, edit);
    }
  }

  protected toggleChecklistLine(): void {
    const textarea = this.textarea()?.nativeElement;
    if (textarea) {
      this.apply(textarea, toggleItemPrefix(textarea.value, textarea.selectionStart));
      textarea.focus();
    }
  }

  protected toggleItem(line: number): void {
    this.draft.update(toggleItem(this.draft.content(), line));
  }

  protected moveItem({ line, to }: { line: number; to: number }): void {
    this.draft.update(moveGroup(this.draft.content(), line, to));
  }

  // „Přidat položku“: prázdná položka s odsazením bloku na daném řádku a úprava s kurzorem za ní
  protected addItem({ line, from }: { line: number; from: number }): void {
    const lines = this.draft.content().split('\n');
    lines.splice(line, 0, `${/^\s*/.exec(lines[from])?.[0] ?? ''}- [ ] `);
    const cursor = lines.slice(0, line + 1).join('\n').length;
    this.draft.update(lines.join('\n'));
    this.mode.set('edit');
    afterNextRender(
      () => {
        const textarea = this.textarea()?.nativeElement;
        textarea?.focus();
        textarea?.setSelectionRange(cursor, cursor);
      },
      { injector: this.injector },
    );
  }

  // Tag: „#“ na pozici kurzoru (za slovem s mezerou); z náhledu se přepne do úprav a vloží se na konec
  protected insertTag(): void {
    const textarea = this.textarea()?.nativeElement;
    if (textarea) {
      this.insertHash(textarea, textarea.selectionStart);
      return;
    }
    this.mode.set('edit');
    afterNextRender(
      () => {
        const textarea = this.textarea()?.nativeElement;
        if (textarea) {
          this.insertHash(textarea, textarea.value.length);
        }
      },
      { injector: this.injector },
    );
  }

  private insertHash(textarea: HTMLTextAreaElement, at: number): void {
    const insert = /\S/.test(textarea.value.charAt(at - 1)) ? ' #' : '#';
    this.apply(textarea, { from: at, to: at, insert, cursor: at + insert.length });
    textarea.focus();
  }

  // Akce panelu přes NoteActions jako v nabídce ⋮ seznamu; barva nové, ještě neuložené poznámky se jen předvyplní
  protected async run(menu: HTMLElement, action: EditorAction, value?: string): Promise<void> {
    menu.hidePopover?.();
    if (action === 'color') {
      this.draft.color.set(value);
    }
    this.actionFailed.set(false);
    try {
      await this.draft.change((note) => {
        switch (action) {
          case 'pin':
            return this.actions.togglePin(note);
          case 'archive':
            return this.actions.setArchived(note, !note.archived);
          case 'template':
            return this.actions.setTemplate(note, true);
          case 'trash':
            return this.actions.trash(note);
          case 'color':
            return this.actions.setColor(note, isNoteColor(value) ? value : undefined);
          case 'category':
            return this.actions.setCategory(note, value);
        }
      });
    } catch {
      // Neuložená barva se nezobrazuje
      this.draft.color.set(this.draft.stored()?.color);
      this.actionFailed.set(true);
      return;
    }
    if (action === 'trash') {
      void this.router.navigate(['/notes']);
    }
  }

  // Fokus na první položku otevřené nabídky
  protected onMenuToggle(event: Event): void {
    if ('newState' in event && event.newState === 'open') {
      (event.target as HTMLElement).querySelector<HTMLElement>('button, a')?.focus();
    }
  }

  private apply(textarea: HTMLTextAreaElement, edit: TextEdit): void {
    textarea.setRangeText(edit.insert, edit.from, edit.to);
    textarea.setSelectionRange(edit.cursor, edit.cursor);
    this.draft.update(textarea.value);
  }

  // Esc zpět na seznam se stejným pohledem a hledáním (uloží se při zavření editoru), Ctrl+Enter přepne režim, Ctrl+Shift+L checklist
  protected onKey(event: KeyboardEvent): void {
    if (!readShortcutsEnabled() || event.isComposing || event.defaultPrevented) {
      return;
    }
    const ctrl = event.ctrlKey || event.metaKey;
    // Esc s otevřenou nabídkou jen zavře nabídku (i když fokus z nabídky odešel); bez podpory popoveru selektor neplatí
    if (event.key === 'Escape' && 'popover' in HTMLElement.prototype && document.querySelector(':popover-open')) {
      return;
    }
    if (event.key === 'Escape' && !ctrl && !event.shiftKey && !event.altKey) {
      void this.router.navigate(['/notes'], { queryParamsHandling: 'preserve', state: this.back() });
    } else if (event.key === 'Enter' && ctrl && !event.shiftKey && !event.altKey && !event.repeat) {
      this.setMode(this.mode() === 'edit' ? 'view' : 'edit');
    } else if (event.code === 'KeyL' && ctrl && event.shiftKey && !event.altKey && !event.repeat && this.mode() === 'edit') {
      this.toggleChecklistLine();
    } else {
      return;
    }
    event.preventDefault();
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void this.draft.flush();
    } else {
      this.refreshToday();
    }
  }

  private refreshToday(): void {
    const now = new Date();
    this.today.set(localDate(now));
    clearTimeout(this.midnightTimer);
    this.midnightTimer = setTimeout(() => this.refreshToday(), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime());
  }
}
