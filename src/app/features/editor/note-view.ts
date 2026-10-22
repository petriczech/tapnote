import { afterNextRender, Component, computed, ElementRef, inject, Injector, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NoteSegment, parseSegments } from '../../core/model/checklist';
import { linkKey, splitLinks } from '../../core/model/links';
import { deriveTitle } from '../../core/model/note';
import { ICONS } from '../../core/icons/icons';

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
    <!-- Název z prvního řádku, pod ním meta řádek z editoru a postup checklistu -->
    @let title = heading();
    @if (title) {
      <h1 class="title"><ng-container *ngTemplateOutlet="rich; context: { $implicit: deriveTitle(title.text) }" /></h1>
    }
    <ng-content />
    @if (progress().total > 0) {
      <progress class="progress" [value]="progress().done" [max]="progress().total" aria-labelledby="checklist-progress"></progress>
      <p class="caption" id="checklist-progress">{{ progress().done }} ze {{ progress().total }} splněno</p>
    }
    @for (segment of segments(); track $index; let block = $index) {
      @if (segment.kind === 'text') {
        @if (!title || segment.line > title.line) {
          <p class="text"><ng-container *ngTemplateOutlet="rich; context: { $implicit: segment.text }" /></p>
        }
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
        <button type="button" class="add-item" (click)="addItem.emit(insertLine(segment))">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>
          Přidat položku
        </button>
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
      padding: 8px 22px 24px;
      font-family: var(--editor-font);
      font-size: 1.0625rem;
      line-height: 1.55;
    }

    .title {
      margin: 4px 0 12px;
      font-family: var(--title-font);
      font-size: 1.875rem;
      font-weight: var(--title-weight);
      letter-spacing: var(--title-spacing);
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    /* Tenký proužek postupu s přechodem (návrh D), popisek pod ním */
    .progress {
      display: block;
      width: 100%;
      height: 6px;
      margin: 16px 0 6px;
      border: 0;
      border-radius: 6px;
      background: var(--outline-variant);
      appearance: none;
      overflow: hidden;
    }

    .progress::-webkit-progress-bar {
      background: transparent;
    }

    .progress::-webkit-progress-value {
      border-radius: 6px;
      background: var(--grad);
    }

    .progress::-moz-progress-bar {
      border-radius: 6px;
      background: var(--grad);
    }

    .caption {
      margin: 0;
      color: var(--on-surface-variant);
      font-family: var(--mono);
      font-size: 0.8125rem;
    }

    .text {
      min-height: 1.5em;
      margin: 0;
      white-space: pre-wrap;
    }

    .checklist {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }

    .checklist li {
      border-bottom: 1px solid var(--outline-variant);
    }

    label {
      display: flex;
      gap: 4px;
      align-items: center;
      min-height: 48px;
      border-radius: 12px;
    }

    /* Kroužek 24 px uprostřed cíle 44 px; zaškrtnutý s přechodem a vyříznutou fajfkou v barvě podkladu */
    input {
      --c: var(--outline);

      flex: none;
      width: 44px;
      height: 44px;
      margin: 0 0 0 -10px;
      border-radius: 50%;
      background: radial-gradient(circle, transparent 9.5px, var(--c) 10px 11.5px, transparent 12px);
      appearance: none;
      cursor: pointer;
    }

    input:checked {
      background: var(--check-fill, var(--grad));
      mask-image:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/%3E%3C/svg%3E"),
        radial-gradient(circle, #000 11.5px, transparent 12px);
      mask-position: center;
      mask-size: 16px, auto;
      mask-repeat: no-repeat;
      mask-composite: exclude;
    }

    /* Maska by ořízla obrys fokusu, kreslí se proto na řádku */
    input:focus-visible {
      outline: none;
    }

    label:has(input:focus-visible) {
      outline: 2px solid var(--ring);
      outline-offset: 2px;
    }

    .done label {
      color: var(--on-surface-variant);
      text-decoration: line-through;
    }

    .link {
      color: var(--primary);
      font-weight: 500;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .link.missing {
      color: var(--on-surface-variant);
      font-weight: inherit;
      text-decoration-style: dashed;
    }

    .add-item,
    .done-toggle {
      display: flex;
      align-items: center;
      min-height: 48px;
      padding: 0;
      border: none;
      background: none;
      color: var(--primary);
      font: inherit;
      font-family: var(--font);
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }

    .add-item {
      gap: 4px;
      margin-left: -10px;
    }

    .add-item .icon {
      width: 44px;
      height: 20px;
    }

    /* Ve vysokém kontrastu se kroužek a proužek kreslí systémovými barvami (přechod by se zahodil) */
    @media (forced-colors: active) {
      input {
        --c: CanvasText;
        --check-fill: CanvasText;

        forced-color-adjust: none;
      }

      .progress {
        forced-color-adjust: none;
        background: Canvas;
        outline: 1px solid CanvasText;
      }

      .progress::-webkit-progress-value {
        background: Highlight;
      }

      .progress::-moz-progress-bar {
        background: Highlight;
      }
    }
  `,
})
export class NoteView {
  readonly content = input.required<string>();
  // Klíč názvu → id poznámky pro odkazy [[Název]]
  readonly targets = input<ReadonlyMap<string, string>>(new Map());
  readonly itemToggle = output<number>();
  // Řádek, na který se vloží nová položka checklistu, a řádek horní úrovně bloku (odsazení)
  readonly addItem = output<{ line: number; from: number }>();

  protected readonly splitLinks = splitLinks;
  protected readonly linkKey = linkKey;
  protected readonly deriveTitle = deriveTitle;
  protected readonly icons = ICONS;

  protected readonly segments = computed(() => parseSegments(this.content()));
  // První neprázdný řádek jako nadpis (stejně jako deriveTitle), pokud není položkou checklistu
  protected readonly heading = computed(() => {
    const first = this.segments().find((segment) => segment.kind !== 'text' || segment.text.trim() !== '');
    return first?.kind === 'text' && deriveTitle(first.text) !== '' ? first : undefined;
  });
  // Splněné položky ze všech checklistů (stejně jako „4/7“ na kartě)
  protected readonly progress = computed(() => {
    const rows = this.segments().flatMap((segment) => (segment.kind === 'checklist' ? [...segment.open, ...segment.done] : []));
    return { done: rows.filter((row) => row.checked).length, total: rows.length };
  });
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

  // Nová položka za poslední nesplněnou, bez nich před první splněnou
  protected insertLine(segment: Extract<NoteSegment, { kind: 'checklist' }>): { line: number; from: number } {
    const last = segment.open.at(-1);
    return { line: last ? last.line + 1 : segment.done[0].line, from: (segment.open[0] ?? segment.done[0]).line };
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
