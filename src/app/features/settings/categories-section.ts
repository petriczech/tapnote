import { afterNextRender, Component, ElementRef, inject, Injector, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CategoryActions, CategoryFields } from '../../core/categories/category-actions';
import { Category, CATEGORY_COLORS } from '../../core/model/category';
import { CATEGORY_ICONS, categoryIconPath } from '../../core/model/category-icons';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { ICONS } from '../../core/icons/icons';

// Rozpracovaná kategorie; id null = nová
type Draft = CategoryFields & { id: string | null };

@Component({
  selector: 'tn-categories-section',
  imports: [NgTemplateOutlet],
  template: `
    <section aria-labelledby="categories-heading">
      <h2 id="categories-heading" tabindex="-1">Kategorie</h2>
      @if (categories().length === 0 && draft() === null) {
        <p class="info">Kategorie mají ikonu a barvu a dají se přiřadit úkolům.</p>
      }

      <ng-template #form>
        @if (draft(); as draft) {
          <form class="form" [attr.aria-label]="draft.id ? 'Upravit kategorii ' + draft.name : 'Nová kategorie'" (submit)="save($event)">
            <label class="name">
              Název
              <input #name required maxlength="40" [value]="draft.name" (input)="patch({ name: name.value })" />
            </label>
            <fieldset>
              <legend>Ikona</legend>
              <div class="tiles">
                @for (icon of icons; track icon.id) {
                  <label class="tile" [title]="icon.label">
                    <input
                      type="radio"
                      name="category-icon"
                      class="visually-hidden"
                      [value]="icon.id"
                      [checked]="draft.icon === icon.id"
                      [attr.aria-label]="icon.label"
                      (change)="patch({ icon: icon.id })"
                    />
                    <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icon.path" /></svg>
                  </label>
                }
              </div>
            </fieldset>
            <fieldset>
              <legend>Barva</legend>
              <div class="tiles">
                @for (color of colors; track color.id) {
                  <label class="tile swatch" [title]="color.label" [style.--cat]="colorVar(color.id)">
                    <input
                      type="radio"
                      name="category-color"
                      class="visually-hidden"
                      [value]="color.id"
                      [checked]="draft.color === color.id"
                      [attr.aria-label]="color.label"
                      (change)="patch({ color: color.id })"
                    />
                  </label>
                }
              </div>
            </fieldset>
            <div class="form-actions">
              @if (draft.id) {
                <button type="button" class="text-btn danger" (click)="remove()">Smazat</button>
              }
              <button type="button" class="text-btn" (click)="cancel()">Zrušit</button>
              <button type="submit" class="filled" [attr.aria-disabled]="!draft.name.trim()">Uložit</button>
            </div>
          </form>
        }
      </ng-template>

      @if (categories().length > 0) {
        <ul class="categories">
          @for (item of categories(); track item.id; let first = $first, last = $last) {
            <li [attr.data-id]="item.id" [style.--cat]="colorVar(item.color)">
              @if (draft()?.id === item.id) {
                <ng-container [ngTemplateOutlet]="form" />
              } @else {
                <span class="badge" aria-hidden="true">
                  <svg class="icon" viewBox="0 0 256 256"><path [attr.d]="iconPath(item.icon)" /></svg>
                </span>
                <span class="item-name">{{ item.name }}</span>
                <button
                  type="button"
                  class="icon-btn"
                  [attr.aria-label]="'Posunout nahoru: ' + item.name"
                  [attr.aria-disabled]="first"
                  (click)="move(item, -1)"
                >
                  <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="uiIcons.caretUp" /></svg>
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  [attr.aria-label]="'Posunout dolů: ' + item.name"
                  [attr.aria-disabled]="last"
                  (click)="move(item, 1)"
                >
                  <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="uiIcons.caretDown" /></svg>
                </button>
                <button type="button" class="text-btn edit" [attr.aria-label]="'Upravit: ' + item.name" (click)="edit(item)">
                  Upravit
                </button>
              }
            </li>
          }
        </ul>
      }

      @if (draft()?.id === null) {
        <ng-container [ngTemplateOutlet]="form" />
      } @else {
        <button type="button" class="outlined add" (click)="startNew()">Přidat kategorii</button>
      }
      <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
    </section>
  `,
  styleUrl: './categories-section.scss',
})
export class CategoriesSection implements OnInit {
  protected readonly uiIcons = ICONS;
  private readonly repository = inject(CategoriesRepository);
  private readonly actions = inject(CategoryActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly icons = CATEGORY_ICONS;
  protected readonly colors = CATEGORY_COLORS;
  protected readonly iconPath = categoryIconPath;
  protected readonly categories = signal<Category[]>([]);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly status = signal('');
  protected readonly failed = signal(false);

  ngOnInit(): Promise<void> {
    return this.load();
  }

  protected colorVar(color: string): string {
    return `var(--c-${color})`;
  }

  protected startNew(): void {
    // Výchozí ikona a barva podle počtu, aby se nové kategorie lišily
    const count = this.categories().length;
    this.open({ id: null, name: '', icon: this.icons[count % this.icons.length].id, color: this.colors[count % this.colors.length].id });
  }

  protected edit(category: Category): void {
    this.open({ id: category.id, name: category.name, icon: category.icon, color: category.color });
  }

  protected patch(changes: Partial<CategoryFields>): void {
    this.draft.update((draft) => (draft ? { ...draft, ...changes } : draft));
  }

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    const draft = this.draft();
    if (!draft?.name.trim()) {
      this.host.querySelector<HTMLInputElement>('.form input')?.focus();
      return;
    }
    const fields: CategoryFields = { name: draft.name, icon: draft.icon, color: draft.color };
    const existing = this.categories().find((item) => item.id === draft.id);
    // Formulář se zavře hned, druhé odeslání už nic nepřidá; při chybě se vrátí
    this.draft.set(null);
    const saved = await this.run(async () => {
      if (existing) {
        await this.actions.update(existing, fields);
        return existing.id;
      }
      return (await this.actions.add(fields)).id;
    });
    if (!saved) {
      // Bez open(): ta by smazala chybovou hlášku
      this.draft.set(draft);
      this.focus('.form input');
    } else {
      this.status.set(existing ? 'Kategorie je uložená.' : 'Kategorie je přidaná.');
      this.focus(`li[data-id="${saved}"] .edit`);
    }
  }

  protected cancel(): void {
    const id = this.draft()?.id;
    this.draft.set(null);
    this.focus(id ? `li[data-id="${id}"] .edit` : '.add');
  }

  protected async remove(): Promise<void> {
    const category = this.categories().find((item) => item.id === this.draft()?.id);
    if (!category || !confirm(`Smazat kategorii „${category.name}“? Úkoly a poznámky v ní zůstanou bez kategorie.`)) {
      return;
    }
    const removed = await this.run(async () => {
      await this.actions.remove(category);
      return category.id;
    });
    if (removed) {
      this.draft.set(null);
      this.status.set('Kategorie je smazaná.');
      this.focus('#categories-heading');
    }
  }

  protected async move(category: Category, step: -1 | 1): Promise<void> {
    const index = this.categories().indexOf(category);
    if (!this.categories()[index + step]) {
      return;
    }
    const moved = await this.run(async () => {
      await this.actions.move(category, step);
      return category.id;
    });
    if (moved) {
      this.focus(`li[data-id="${category.id}"] [aria-label^="${step < 0 ? 'Posunout nahoru' : 'Posunout dolů'}"]`);
    }
  }

  private open(draft: Draft): void {
    this.status.set('');
    this.draft.set(draft);
    this.focus('.form input');
  }

  // Vrátí id dotčené kategorie, při chybě undefined
  private async run(action: () => Promise<string>): Promise<string | undefined> {
    this.failed.set(false);
    try {
      return await action();
    } catch {
      this.failed.set(true);
      this.status.set('Akci se nepodařilo dokončit.');
      return undefined;
    } finally {
      await this.load();
    }
  }

  private focus(selector: string): void {
    afterNextRender(() => this.host.querySelector<HTMLElement>(selector)?.focus(), { injector: this.injector });
  }

  private async load(): Promise<void> {
    try {
      this.categories.set(await this.repository.getAll());
    } catch {
      this.failed.set(true);
      this.status.set('Kategorie se nepodařilo načíst.');
    }
  }
}
