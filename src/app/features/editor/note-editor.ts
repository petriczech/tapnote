import {
  afterNextRender,
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { continueList, hasChecklist, TextEdit, toggleItem, toggleItemPrefix } from '../../core/model/checklist';
import { backlinks, extractLinks, linkTargets } from '../../core/model/links';
import { deriveTitle, Note } from '../../core/model/note';
import { noteColorVar } from '../../core/model/note-colors';
import { NotesRepository } from '../../core/storage/notes-repository';
import { readShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { NoteDraft } from './note-draft';
import { NoteView } from './note-view';
import { ICONS } from '../../core/icons/icons';

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
    <div class="toolbar">
      <a class="icon-btn list-link" routerLink="/notes" title="Seznam">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.back" /></svg>
        <span class="visually-hidden">Seznam</span>
      </a>
      @if (draft.content().trim() && draft.saved()) {
        <span class="saved">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.check" /></svg>
          Uloženo
        </span>
      }
      @if (draft.noteId(); as noteId) {
        <a class="icon-btn" [routerLink]="['/note', noteId, 'history']" title="Historie">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.history" /></svg>
          <span class="visually-hidden">Historie</span>
        </a>
      }
      @if (mode() === 'edit') {
        <button
          type="button"
          class="icon-btn"
          title="Checklist"
          (pointerdown)="$event.preventDefault()"
          (click)="toggleChecklistLine()"
        >
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.checklist" /></svg>
          <span class="visually-hidden">Checklist</span>
        </button>
        <button type="button" class="icon-btn" title="Hotovo" (click)="setMode('view')">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.eye" /></svg>
          <span class="visually-hidden">Hotovo</span>
        </button>
      } @else {
        <button #editButton type="button" class="icon-btn on" title="Upravit" (click)="setMode('edit')">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.pencil" /></svg>
          <span class="visually-hidden">Upravit</span>
        </button>
      }
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
      <tn-note-view class="view" [content]="draft.content()" [targets]="targets()" (itemToggle)="toggleItem($event)" />
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
    <p class="status" aria-live="polite">
      @if (draft.saveFailed()) {
        Neuloženo
      }
    </p>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100dvh;
      padding-bottom: env(safe-area-inset-bottom);
      background: var(--note-bg, var(--editor-bg));
    }

    /* Akcent na barevném pozadí v barvě textu kvůli kontrastu */
    :host(.colored) {
      --primary: var(--on-surface);
    }

    .toolbar {
      display: flex;
      align-items: center;
      min-height: 56px;
      padding: env(safe-area-inset-top) 4px 0;
    }

    .list-link {
      margin-right: auto;
    }

    .saved {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-right: 4px;
      color: var(--on-surface-variant);
      font-size: 0.8125rem;
    }

    .saved .icon {
      width: 16px;
      height: 16px;
    }

    .view {
      flex: 1;
      overflow: auto;
    }

    .editor {
      flex: 1;
      padding: 8px 20px;
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
      outline: 2px solid var(--primary);
      outline-offset: -2px;
    }

    .backlinks {
      max-height: 40dvh;
      overflow: auto;
      padding: 8px 20px;
      border-top: 1px solid var(--outline-variant);
    }

    .backlinks h2 {
      margin: 0;
      color: var(--on-surface-variant);
      font-size: 0.8125rem;
      font-weight: 600;
    }

    .backlinks ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .backlinks a {
      display: flex;
      align-items: center;
      min-height: 48px;
      color: var(--primary);
    }

    .status {
      position: fixed;
      right: 1rem;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      margin: 0;
      color: var(--error);
    }
  `,
})
export class NoteEditor implements OnInit {
  protected readonly icons = ICONS;
  readonly id = input<string>();
  readonly resume = input(false, { transform: booleanAttribute });
  // Id šablony pro novou poznámku (/new?template=…)
  readonly template = input<string>();

  protected readonly draft = inject(NoteDraft);
  private readonly repository = inject(NotesRepository);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');

  protected readonly mode = signal<'edit' | 'view'>('edit');
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

  constructor() {
    afterNextRender(() => this.textarea()?.nativeElement.focus());
    this.destroyRef.onDestroy(() => void this.draft.flush());
  }

  async ngOnInit(): Promise<void> {
    void this.repository
      .getAll()
      .then((notes) => this.notes.set(notes))
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

  private apply(textarea: HTMLTextAreaElement, edit: TextEdit): void {
    textarea.setRangeText(edit.insert, edit.from, edit.to);
    textarea.setSelectionRange(edit.cursor, edit.cursor);
    this.draft.update(textarea.value);
  }

  // Esc zpět na seznam (uloží se při zavření editoru), Ctrl+Enter přepne režim, Ctrl+Shift+L checklist
  protected onKey(event: KeyboardEvent): void {
    if (!readShortcutsEnabled() || event.isComposing || event.defaultPrevented) {
      return;
    }
    const ctrl = event.ctrlKey || event.metaKey;
    if (event.key === 'Escape' && !ctrl && !event.shiftKey && !event.altKey) {
      void this.router.navigate(['/notes']);
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
    }
  }
}
