import { afterNextRender, Component, computed, ElementRef, inject, Injector, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryActions, CategoryFields } from '../../core/categories/category-actions';
import { Category, CATEGORY_COLORS } from '../../core/model/category';
import { CATEGORY_ICONS, categoryIconPath } from '../../core/model/category-icons';
import { Reorder, ReorderMove } from '../../core/reorder/reorder';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { ICONS, ICONS_REGULAR } from '../../core/icons/icons';
import { BottomNav } from '../list/bottom-nav';

// Rozpracovaná kategorie; id null = nová
type Draft = CategoryFields & { id: string | null };

// Podstránka Nastavení › Kategorie (obrazovka 04 návrhu D): seznam s počty, úprava ve spodním panelu na <dialog>
@Component({
  selector: 'tn-categories',
  imports: [BottomNav, Reorder, RouterLink],
  template: `
    <tn-bottom-nav current="settings" />

    <header id="obsah" class="app-bar" tabindex="-1">
      <a class="crumbs" routerLink="/settings">
        Nastavení
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="regular.caretRight" /></svg>
      </a>
      <h1 tabindex="-1">Kategorie</h1>
    </header>

    @if (categories().length === 0) {
      <p class="info">Kategorie mají ikonu a barvu a dají se přiřadit úkolům.</p>
    } @else {
      <h2 id="mine-heading" class="section-h">Moje kategorie</h2>
      <ul class="categories" aria-labelledby="mine-heading" [tnReorder]="names()" (moved)="moveTo($event)">
        @for (item of categories(); track item.id; let i = $index, first = $first, last = $last) {
          <li [attr.data-id]="item.id" [style.--cat]="colorVar(item.color)">
            <button
              type="button"
              class="edit"
              [attr.aria-label]="'Upravit: ' + item.name"
              [attr.aria-describedby]="'count-' + i"
              (click)="edit(item)"
            >
              <span class="badge" aria-hidden="true">
                <svg class="icon" viewBox="0 0 256 256"><path [attr.d]="iconPath(item.icon)" /></svg>
              </span>
              <span class="item-name">{{ item.name }}</span>
              <span class="count" [id]="'count-' + i"><span class="visually-hidden">Položek: </span>{{ counts().get(item.id) ?? 0 }}</span>
            </button>
            <button
              type="button"
              class="move"
              [attr.aria-label]="'Posunout nahoru: ' + item.name"
              [attr.aria-disabled]="first"
              (click)="move(item, -1)"
            >
              <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="uiIcons.caretUp" /></svg>
            </button>
            <button
              type="button"
              class="move"
              [attr.aria-label]="'Posunout dolů: ' + item.name"
              [attr.aria-disabled]="last"
              (click)="move(item, 1)"
            >
              <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="uiIcons.caretDown" /></svg>
            </button>
            <button
              type="button"
              class="grip"
              [attr.aria-label]="'Přesunout: ' + item.name"
              aria-describedby="reorder-hint"
              aria-pressed="false"
            >
              <span aria-hidden="true">⠿</span>
            </button>
          </li>
        }
      </ul>
      <p id="reorder-hint" hidden>Úchyt se táhne prstem nebo myší. Mezerník nebo Enter řádek uchopí, šipky ho posunou, další stisk ho pustí a Esc přesun zruší.</p>
    }
    <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>

    <!-- „Nová“ dole na dosah palce (ux.md, obrazovka 04) -->
    <button type="button" class="fab add" (click)="startNew()">
      <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="uiIcons.plus" /></svg>
      Přidat kategorii
    </button>

    <!-- Spodní panel: showModal() drží fokus uvnitř; Esc a klepnutí mimo panel (closedby="any", Safari zatím ne) ho zavřou -->
    <dialog #sheet class="sheet" aria-labelledby="sheet-title" closedby="any" (close)="dismiss()">
      @if (draft(); as draft) {
        <form class="form" [style.--cat]="colorVar(draft.color)" (submit)="save($event)">
          <span class="grab" aria-hidden="true"></span>
          <div class="sheet-head">
            <h2 id="sheet-title">{{ draft.id ? 'Upravit kategorii' : 'Nová kategorie' }}</h2>
            <span class="badge" aria-hidden="true">
              <svg class="icon" viewBox="0 0 256 256"><path [attr.d]="iconPath(draft.icon)" /></svg>
            </span>
          </div>
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
            <div class="tiles swatches">
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
          @if (failed()) {
            <p class="status error" role="alert">{{ status() }}</p>
          }
          <div class="form-actions">
            @if (draft.id) {
              <button type="button" class="text-btn danger" (click)="remove()">
                <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="regular.trash" /></svg>
                Smazat
              </button>
            }
            <button type="button" class="text-btn" (click)="dismiss()">Zrušit</button>
            <button type="submit" class="save" [attr.aria-disabled]="!draft.name.trim()">Uložit</button>
          </div>
        </form>
      }
    </dialog>
  `,
  styleUrl: './categories.scss',
})
export class Categories implements OnInit {
  protected readonly uiIcons = ICONS;
  protected readonly regular = ICONS_REGULAR;
  private readonly repository = inject(CategoriesRepository);
  private readonly tasks = inject(TasksRepository);
  private readonly notes = inject(NotesRepository);
  private readonly actions = inject(CategoryActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly sheet = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  protected readonly icons = CATEGORY_ICONS;
  protected readonly colors = CATEGORY_COLORS;
  protected readonly iconPath = categoryIconPath;
  protected readonly categories = signal<Category[]>([]);
  protected readonly names = computed(() => this.categories().map((item) => item.name));
  // Počet úkolů a poznámek mimo koš (bez šablon) podle id kategorie
  protected readonly counts = signal(new Map<string, number>());
  protected readonly draft = signal<Draft | null>(null);
  protected readonly status = signal('');
  protected readonly failed = signal(false);

  constructor() {
    // Po přechodu z rozcestníku se fokus přesune na nadpis podstránky, jinak by spadl na body
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus());
  }

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
    // Formulář zmizí hned, druhé odeslání už nic nepřidá; panel se zavře až po uložení, při chybě se formulář vrátí
    // (dřívější close() by událostí close po rychlé chybě obnovenou kategorii zase zahodil)
    this.draft.set(null);
    const saved = await this.run(async () => {
      if (existing) {
        await this.actions.update(existing, fields);
        return existing.id;
      }
      return (await this.actions.add(fields)).id;
    });
    if (this.draft()) {
      // Během ukládání se panel zavřel a otevřel znovu; nový obsah se výsledkem nezavře ani nepřepíše
      return;
    }
    if (!saved) {
      // Bez open(): ta by smazala chybovou hlášku
      this.draft.set(draft);
      this.show();
    } else {
      this.sheet().nativeElement.close();
      this.status.set(existing ? 'Kategorie je uložená.' : 'Kategorie je přidaná.');
      this.focus(`li[data-id="${CSS.escape(saved)}"] .edit`);
    }
  }

  // Zrušit, Esc a klepnutí mimo panel (událost close) vrátí fokus na řádek, ze kterého se panel otevřel, nebo na „Přidat kategorii“
  protected dismiss(): void {
    const draft = this.draft();
    if (!draft) {
      // Uložení a smazání vynulují rozpracovanou kategorii před zavřením a fokus si řídí samy
      return;
    }
    const id = draft.id;
    this.draft.set(null);
    this.sheet().nativeElement.close();
    this.focus(id ? `li[data-id="${CSS.escape(id)}"] .edit` : '.add');
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
      this.sheet().nativeElement.close();
      this.status.set('Kategorie je smazaná.');
      this.focus('h1');
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
      this.focus(`li[data-id="${CSS.escape(category.id)}"] [aria-label^="${step < 0 ? 'Posunout nahoru' : 'Posunout dolů'}"]`);
    }
  }

  // Přetažení úchytem; pořadí se přepíše hned, aby řádky po puštění neposkočily zpět, než se načte uložené
  protected async moveTo({ from, to }: ReorderMove): Promise<void> {
    const category = this.categories()[from];
    this.categories.update((list) => {
      const next = [...list];
      next.splice(to, 0, ...next.splice(from, 1));
      return next;
    });
    const moved = await this.run(async () => {
      await this.actions.moveTo(category, to);
      return category.id;
    });
    if (moved) {
      this.focus(`li[data-id="${CSS.escape(category.id)}"] .grip`);
    }
  }

  private open(draft: Draft): void {
    this.status.set('');
    this.failed.set(false);
    this.draft.set(draft);
    this.show();
  }

  // Panel se otevře až po vykreslení obsahu, fokus jde na Název
  private show(): void {
    afterNextRender(
      () => {
        const sheet = this.sheet().nativeElement;
        if (!sheet.open) {
          sheet.showModal();
        }
        sheet.querySelector<HTMLInputElement>('.form input')?.focus();
      },
      { injector: this.injector },
    );
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

  // Kategorie a k nim počty z úkolů a poznámek; chyba počtů seznam neskryje, zůstanou předchozí počty
  private async load(): Promise<void> {
    try {
      this.categories.set(await this.repository.getAll());
    } catch {
      this.failed.set(true);
      this.status.set('Kategorie se nepodařilo načíst.');
    }
    try {
      const [tasks, notes] = await Promise.all([this.tasks.getAll(), this.notes.getAll()]);
      const counts = new Map<string, number>();
      for (const item of [...tasks, ...notes]) {
        if (item.categoryId && !item.deletedAt && !('isTemplate' in item && item.isTemplate)) {
          counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
        }
      }
      this.counts.set(counts);
    } catch {
      // Počty jsou jen doplněk seznamu
    }
  }
}
