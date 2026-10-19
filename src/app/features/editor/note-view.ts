import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, output, signal } from '@angular/core';
import { parseSegments } from '../../core/model/checklist';

@Component({
  selector: 'tn-note-view',
  template: `
    @for (segment of segments(); track $index; let block = $index) {
      @if (segment.kind === 'text') {
        <p class="text">{{ segment.text }}</p>
      } @else {
        <ul class="checklist">
          @for (row of segment.open; track row.line) {
            <li [style.padding-left.rem]="row.level * 1.5">
              <label>
                <input
                  #box
                  type="checkbox"
                  [checked]="row.checked"
                  [attr.aria-label]="row.text ? null : 'Prázdná položka'"
                  (change)="onChange(box, row.line, row.checked)"
                />
                {{ row.text }}
              </label>
            </li>
          }
        </ul>
        @if (segment.doneCount > 0) {
          <button
            type="button"
            class="done-toggle"
            [attr.aria-expanded]="expanded().has(block)"
            (click)="toggleExpanded(block)"
          >
            Hotové ({{ segment.doneCount }})
          </button>
          @if (expanded().has(block)) {
            <ul class="checklist done">
              @for (row of segment.done; track row.line) {
                <li [style.padding-left.rem]="row.level * 1.5">
                  <label>
                    <input
                      #box
                      type="checkbox"
                      [checked]="row.checked"
                      [attr.aria-label]="row.text ? null : 'Prázdná položka'"
                      (change)="onChange(box, row.line, row.checked)"
                    />
                    {{ row.text }}
                  </label>
                </li>
              }
            </ul>
          }
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 8px 20px;
      font-size: 1.0625rem;
      line-height: 1.55;
    }

    .text {
      min-height: 1.5em;
      margin: 0;
      white-space: pre-wrap;
    }

    .checklist {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    label {
      display: flex;
      gap: 12px;
      align-items: center;
      min-height: 48px;
    }

    input {
      flex: none;
      width: 22px;
      height: 22px;
      margin: 0;
      accent-color: var(--primary);
    }

    .done label {
      color: var(--on-surface-variant);
      text-decoration: line-through;
    }

    .done-toggle {
      min-height: 48px;
      padding: 0;
      border: none;
      background: none;
      font: inherit;
      font-weight: 600;
      color: var(--primary);
    }
  `,
})
export class NoteView {
  readonly content = input.required<string>();
  readonly itemToggle = output<number>();

  protected readonly segments = computed(() => parseSegments(this.content()));
  protected readonly expanded = signal(new Set<number>());

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  // Stav checkboxu podle obsahu poznámky
  protected onChange(box: HTMLInputElement, line: number, checked: boolean): void {
    box.checked = checked;
    const index = this.checkboxes().indexOf(box);
    this.itemToggle.emit(line);
    afterNextRender(() => this.keepFocus(index), { injector: this.injector });
  }

  // Fokus na stejnou pozici, když přepnutá položka zmizela
  private keepFocus(index: number): void {
    if (this.host.contains(document.activeElement)) {
      return;
    }
    const boxes = this.checkboxes();
    (boxes[Math.min(index, boxes.length - 1)] ?? this.host.querySelector<HTMLElement>('.done-toggle'))?.focus();
  }

  private checkboxes(): HTMLInputElement[] {
    return [...this.host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  }

  protected toggleExpanded(block: number): void {
    this.expanded.update((expanded) => {
      const next = new Set(expanded);
      if (!next.delete(block)) {
        next.add(block);
      }
      return next;
    });
  }
}
