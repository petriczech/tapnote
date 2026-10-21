import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { parseSegments } from '../../core/model/checklist';
import { linkKey, splitLinks } from '../../core/model/links';

@Component({
  selector: 'tn-note-view',
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    <ng-template #rich let-text>
      @for (part of splitLinks(text); track $index) {
        @if ('link' in part) {
          @if (targets().get(linkKey(part.link)); as id) {
            <a class="link" [routerLink]="['/note', id]">{{ part.link }}</a>
          } @else {
            <span class="link missing" title="Poznámka zatím neexistuje">{{ part.link }}</span>
          }
        } @else {
          <ng-container>{{ part.text }}</ng-container>
        }
      }
    </ng-template>
    @for (segment of segments(); track $index; let block = $index) {
      @if (segment.kind === 'text') {
        <p class="text"><ng-container *ngTemplateOutlet="rich; context: { $implicit: segment.text }" /></p>
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
                <span><ng-container *ngTemplateOutlet="rich; context: { $implicit: row.text }" /></span>
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
                    <span><ng-container *ngTemplateOutlet="rich; context: { $implicit: row.text }" /></span>
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
      font-family: var(--editor-font);
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

    .link {
      color: var(--primary);
      text-decoration: underline;
    }

    .link.missing {
      color: var(--on-surface-variant);
      text-decoration-style: dashed;
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
  // Klíč názvu → id poznámky pro odkazy [[Název]]
  readonly targets = input<ReadonlyMap<string, string>>(new Map());
  readonly itemToggle = output<number>();

  protected readonly splitLinks = splitLinks;
  protected readonly linkKey = linkKey;

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
