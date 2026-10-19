import {
  afterNextRender,
  booleanAttribute,
  Component,
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
import { NoteDraft } from './note-draft';
import { NoteView } from './note-view';

@Component({
  selector: 'tn-note-editor',
  imports: [NoteView, RouterLink],
  providers: [NoteDraft],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pagehide)': 'draft.flush()',
  },
  template: `
    <div class="toolbar">
      <a class="icon-btn list-link" routerLink="/notes" title="Seznam">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        <span class="visually-hidden">Seznam</span>
      </a>
      @if (draft.content().trim() && draft.saved()) {
        <span class="saved">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
          Uloženo
        </span>
      }
      @if (mode() === 'edit') {
        <button
          type="button"
          class="icon-btn"
          title="Checklist"
          (pointerdown)="$event.preventDefault()"
          (click)="toggleChecklistLine()"
        >
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-9 14-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" /></svg>
          <span class="visually-hidden">Checklist</span>
        </button>
        <button type="button" class="icon-btn" title="Hotovo" (click)="setMode('view')">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" /></svg>
          <span class="visually-hidden">Hotovo</span>
        </button>
      } @else {
        <button #editButton type="button" class="icon-btn on" title="Upravit" (click)="setMode('edit')">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" /></svg>
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
      <tn-note-view class="view" [content]="draft.content()" (itemToggle)="toggleItem($event)" />
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
      background: none;
      color: inherit;
      font: inherit;
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
  readonly id = input<string>();
  readonly resume = input(false, { transform: booleanAttribute });

  protected readonly draft = inject(NoteDraft);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly textarea = viewChild<ElementRef<HTMLTextAreaElement>>('textarea');
  private readonly editButton = viewChild<ElementRef<HTMLButtonElement>>('editButton');

  protected readonly mode = signal<'edit' | 'view'>('edit');

  constructor() {
    afterNextRender(() => this.textarea()?.nativeElement.focus());
    this.destroyRef.onDestroy(() => void this.draft.flush());
  }

  async ngOnInit(): Promise<void> {
    const opened = await this.draft.open(this.id(), this.resume());
    if (!opened && !this.destroyRef.destroyed) {
      await this.router.navigate(['/new'], { replaceUrl: true });
    } else if (this.id() !== undefined && hasChecklist(this.draft.content())) {
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

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void this.draft.flush();
    }
  }
}
