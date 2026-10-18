import {
  afterNextRender,
  booleanAttribute,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { NoteDraft } from './note-draft';

@Component({
  selector: 'tn-note-editor',
  providers: [NoteDraft],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pagehide)': 'draft.flush()',
  },
  template: `
    <textarea
      #textarea
      class="editor"
      aria-label="Poznámka"
      [value]="draft.content()"
      [readOnly]="draft.loading()"
      (input)="draft.update(textarea.value)"
    ></textarea>
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
  private readonly textarea = viewChild.required<ElementRef<HTMLTextAreaElement>>('textarea');

  constructor() {
    afterNextRender(() => this.textarea().nativeElement.focus());
    this.destroyRef.onDestroy(() => void this.draft.flush());
  }

  async ngOnInit(): Promise<void> {
    const opened = await this.draft.open(this.id(), this.resume());
    if (!opened && !this.destroyRef.destroyed) {
      await this.router.navigate(['/new'], { replaceUrl: true });
    }
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void this.draft.flush();
    }
  }
}
