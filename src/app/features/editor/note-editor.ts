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
      <a class="list-link" routerLink="/notes">Seznam</a>
      @if (mode() === 'edit') {
        <button type="button" (pointerdown)="$event.preventDefault()" (click)="toggleChecklistLine()">
          Checklist
        </button>
        <button type="button" (click)="setMode('view')">Hotovo</button>
      } @else {
        <button #editButton type="button" (click)="setMode('edit')">Upravit</button>
      }
    </div>
    @if (mode() === 'edit') {
      <textarea
        #textarea
        class="editor"
        aria-label="Poznámka"
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
      height: 100dvh;
    }

    .toolbar {
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
      padding: 0.25rem 0.5rem;
    }

    .list-link {
      display: flex;
      align-items: center;
      margin-right: auto;
      min-height: 2.75rem;
      padding: 0 0.75rem;
      color: #1a56b8;
      text-decoration: none;
    }

    .toolbar button {
      min-width: 2.75rem;
      min-height: 2.75rem;
      padding: 0 0.75rem;
      border: none;
      border-radius: 0.5rem;
      background: none;
      font: inherit;
      color: #1a56b8;
    }

    .view {
      flex: 1;
      overflow: auto;
    }

    .editor {
      flex: 1;
      padding: 1rem;
      border: none;
      resize: none;
      font: inherit;
      font-size: 1.125rem;
      line-height: 1.5;
    }

    .editor:focus {
      outline: none;
    }

    .editor:focus-visible {
      outline: 2px solid #1a73e8;
      outline-offset: -2px;
    }

    .status {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      margin: 0;
      color: #b00020;
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
