import { afterNextRender, Component, computed, DestroyRef, effect, ElementRef, inject, Injector, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Category } from '../../core/model/category';
import { Task, TaskStep } from '../../core/model/task';
import { localDate } from '../../core/model/task-query';
import { readShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { TaskActions } from '../../core/tasks/task-actions';
import { Undo } from '../../core/undo/undo';
import { Split } from '../list/split';
import { ICONS, ICONS_FILL, ICONS_REGULAR } from '../../core/icons/icons';

type TaskChanges = Parameters<TaskActions['update']>[1];

// Text se ukládá průběžně po krátké pauze v psaní
const TEXT_DEBOUNCE_MS = 400;

@Component({
  selector: 'tn-task-detail',
  imports: [RouterLink],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pagehide)': 'flushText()',
    '(document:keydown)': 'onKey($event)',
    '[style.--cat]': 'catVar()',
  },
  template: `
    <!-- Horní lišta jako v editoru: zpět, stav uložení, Smazat -->
    <div class="toolbar">
      <a class="icon-btn" routerLink="/tasks" queryParamsHandling="preserve" [state]="back()" title="Úkoly">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconsRegular.back" /></svg>
        <span class="visually-hidden">Úkoly</span>
      </a>
      @if (task() && !failed() && !typing()) {
        <span class="saved"><span class="dot" aria-hidden="true"></span>Uloženo</span>
      }
      <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
      @if (task()) {
        <button type="button" class="tool danger" (click)="trash()">Smazat</button>
      }
    </div>

    @if (task(); as task) {
      <h1 class="visually-hidden" tabindex="-1">Detail úkolu</h1>
      <div class="head">
        <input type="checkbox" class="check" aria-label="Hotovo" [checked]="task.done" (change)="toggleDone($event)" />
        <textarea
          #title
          class="title"
          rows="1"
          aria-label="Název úkolu"
          [value]="initialText().title"
          (keydown.enter)="$event.preventDefault(); flushText()"
          (input)="queueText('title', title.value)"
          (blur)="onTitleBlur(title)"
        ></textarea>
        <button
          type="button"
          class="icon-btn star"
          [class.on]="task.important"
          aria-label="Důležité"
          [attr.aria-pressed]="task.important"
          (click)="toggleImportant()"
        >
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="task.important ? iconsFill.star : icons.star" /></svg>
        </button>
      </div>

      <section class="card steps" aria-labelledby="steps-heading">
        <h2 id="steps-heading" class="label">Kroky</h2>
        @if (task.steps.length > 0) {
          <ul>
            @for (step of task.steps; track step.id) {
              <li [class.done]="step.done">
                <input type="checkbox" class="check small" [checked]="step.done" [attr.aria-label]="step.title" (change)="toggleStep(step)" />
                <span class="step-title">{{ step.title }}</span>
                <button type="button" class="icon-btn" [attr.aria-label]="'Smazat krok: ' + step.title" (click)="removeStep(step)">
                  <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
                    <path [attr.d]="icons.close" />
                  </svg>
                </button>
              </li>
            }
          </ul>
        }
        <form class="add-step" (submit)="addStep($event, step)">
          <input #step aria-label="Nový krok" placeholder="Přidat krok" autocomplete="off" />
        </form>
      </section>

      <div class="card fields">
        <button type="button" class="field" [class.on]="inMyDay()" (click)="toggleMyDay()">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
            <path [attr.d]="icons.sun" />
          </svg>
          {{ inMyDay() ? 'Přidáno do Můj den' : 'Přidat do Můj den' }}
        </button>
        <label class="field">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
            <path [attr.d]="icons.calendar" />
          </svg>
          <span class="label">Termín</span>
          <input #due type="date" [value]="task.dueDate ?? ''" (change)="save({ dueDate: due.value || undefined })" />
        </label>
        <label class="field">
          <span class="dot" aria-hidden="true"></span>
          <span class="label">Kategorie</span>
          <select #category (change)="save({ categoryId: category.value || undefined })">
            <option value="">Bez kategorie</option>
            @for (item of categories(); track item.id) {
              <option [value]="item.id" [selected]="item.id === task.categoryId">{{ item.name }}</option>
            }
          </select>
        </label>
      </div>

      <label class="card note">
        <span class="label">Poznámka</span>
        <textarea #note rows="4" placeholder="Přidat poznámku" [value]="initialText().note" (input)="queueText('note', note.value)" (blur)="flushText()"></textarea>
      </label>
    }
  `,
  styleUrl: './task-detail.scss',
})
export class TaskDetail implements OnInit {
  protected readonly icons = ICONS;
  protected readonly iconsRegular = ICONS_REGULAR;
  protected readonly iconsFill = ICONS_FILL;
  readonly id = input.required<string>();

  private readonly repository = inject(TasksRepository);
  private readonly categoriesRepository = inject(CategoriesRepository);
  private readonly actions = inject(TaskActions);
  private readonly undo = inject(Undo);
  private readonly router = inject(Router);
  // Vedle seznamu (od 1200 px) si návrat na seznam nese id úkolu pro fokus na jeho řádek
  private readonly split = inject(Split, { optional: true });
  protected readonly back = computed(() => (this.split?.wide() ? { focus: this.id() } : undefined));

  protected readonly today = localDate(new Date());

  protected readonly task = signal<Task | undefined>(undefined);
  // Text polí jen z prvního načtení: další načtení by přepsalo, co se mezitím dopsalo
  protected readonly initialText = signal({ title: '', note: '' });
  protected readonly categories = signal<Category[]>([]);
  protected readonly status = signal('');
  protected readonly failed = signal(false);
  // Rozepsaný text ještě není uložený, „Uloženo“ se mezitím skryje
  protected readonly typing = signal(false);
  protected readonly inMyDay = computed(() => this.task()?.myDay === this.today);
  protected readonly catVar = computed(() => {
    const category = this.categories().find((item) => item.id === this.task()?.categoryId);
    return category ? `var(--c-${category.color})` : null;
  });

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  // Rozepsaný název a poznámka čekající na uložení
  private pendingText: { title?: string; note?: string } = {};
  private textTimer?: ReturnType<typeof setTimeout>;
  // Ukládání jde za sebou a vždy z posledního načteného úkolu
  private saving = Promise.resolve();

  constructor() {
    // Seznam vedle detailu se obnoví po každém uložení i po zavření detailu a označí otevřený úkol
    effect(() => {
      this.split?.openId.set(this.task()?.id);
      this.split?.saves.update((count) => count + 1);
    });
    // Po vrácení dokončení z lišty Zpět se úkol načte znovu a fokus přejde z odstraněného tlačítka na zaškrtávátko
    this.undo.undone.pipe(takeUntilDestroyed()).subscribe(async (id) => {
      await this.load();
      if (id === this.id()) {
        afterNextRender(() => this.host.querySelector<HTMLElement>('.head .check')?.focus(), { injector: this.injector });
      }
    });
    inject(DestroyRef).onDestroy(() => void this.flushText().then(() => this.split?.saves.update((count) => count + 1)));
  }

  async ngOnInit(): Promise<void> {
    this.categories.set(await this.categoriesRepository.getAll().catch(() => []));
    if (!(await this.load())) {
      await this.router.navigate(['/tasks'], { replaceUrl: true });
      return;
    }
    const task = this.task();
    this.initialText.set({ title: task?.title ?? '', note: task?.note ?? '' });
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus(), { injector: this.injector });
  }

  protected async toggleDone(event: Event): Promise<void> {
    const before = this.task();
    await this.save((task) => ({ done: !task.done, completedAt: task.done ? undefined : new Date().toISOString() }));
    // Při chybě uložení se zaškrtnutí vrátí podle uloženého úkolu
    if (this.failed() && event.target instanceof HTMLInputElement) {
      event.target.checked = this.task()?.done ?? false;
    } else if (before && !before.done) {
      // Zpět jen po dokončení; vrátí původní stav a čas dokončení
      this.undo.show('Úkol je hotový.', before.id, () => this.actions.update(before, { done: before.done, completedAt: before.completedAt }));
    }
  }

  protected toggleImportant(): Promise<void> {
    return this.save((task) => ({ important: !task.important }));
  }

  protected toggleMyDay(): Promise<void> {
    return this.save((task) => ({ myDay: task.myDay === this.today ? undefined : this.today }));
  }

  protected queueText(field: 'title' | 'note', value: string): void {
    this.pendingText[field] = value;
    this.typing.set(true);
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.flushText(), TEXT_DEBOUNCE_MS);
  }

  // Prázdný název se neuloží
  protected flushText(): Promise<void> {
    clearTimeout(this.textTimer);
    this.typing.set(false);
    const { title, note } = this.pendingText;
    this.pendingText = {};
    const changes: TaskChanges = {
      ...(title?.trim() ? { title: title.trim() } : {}),
      ...(note === undefined ? {} : { note }),
    };
    return Object.keys(changes).length > 0 ? this.save(changes) : this.saving;
  }

  // Po opuštění prázdného názvu se vrátí uložený
  protected async onTitleBlur(input: HTMLTextAreaElement): Promise<void> {
    await this.flushText();
    if (!input.value.trim()) {
      input.value = this.task()?.title ?? '';
    }
  }

  protected async addStep(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      return;
    }
    input.value = '';
    await this.save((task) => ({ steps: [...task.steps, { id: crypto.randomUUID(), title, done: false }] }));
  }

  protected toggleStep(step: TaskStep): Promise<void> {
    return this.save((task) => ({
      steps: task.steps.map((item) => (item.id === step.id ? { ...item, done: !item.done } : item)),
    }));
  }

  // Fokus do pole pro nový krok, smazané tlačítko zmizí
  protected async removeStep(step: TaskStep): Promise<void> {
    await this.save((task) => ({ steps: task.steps.filter((item) => item.id !== step.id) }));
    afterNextRender(() => this.host.querySelector<HTMLElement>('.add-step input')?.focus(), { injector: this.injector });
  }

  protected async trash(): Promise<void> {
    await this.flushText();
    const task = this.task();
    if (!task) {
      return;
    }
    try {
      await this.actions.trash(task);
      await this.router.navigate(['/tasks'], { queryParamsHandling: 'preserve' });
      // Lišta je v kostře aplikace, Zpět na seznamu úkol obnoví a seznam se načte znovu
      this.undo.show('Úkol je smazaný.', task.id, () => this.actions.restore(task));
    } catch {
      this.failed.set(true);
      this.status.set('Úkol se nepodařilo smazat.');
    }
  }

  // Esc zpět na seznam jako odkaz Úkoly v liště (vedle seznamu i s fokusem na řádek úkolu)
  protected onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    if (!readShortcutsEnabled() || event.isComposing || event.defaultPrevented) {
      return;
    }
    // Otevřený dialog nebo nabídka se zavře sama a detail zůstane, během tahu myší v seznamu se detail nezavře; bez podpory popoveru selektor neplatí
    if (document.querySelector('dialog[open], .reorder-dragging') || ('popover' in HTMLElement.prototype && document.querySelector(':popover-open'))) {
      return;
    }
    // Esc v poli seznamu vedle detailu (Nový úkol) detail nezavře, rozepsaný text by se ztratil
    const target = event.target;
    if (target instanceof HTMLElement && !this.host.contains(target) && target.matches('input:not([type=checkbox], [type=radio]), textarea, select')) {
      return;
    }
    event.preventDefault();
    void this.router.navigate(['/tasks'], { queryParamsHandling: 'preserve', state: this.back() });
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void this.flushText();
    }
  }

  // Změny se počítají z posledního uloženého stavu, aby se rychlé akce nepřepsaly
  protected save(changes: TaskChanges | ((task: Task) => TaskChanges)): Promise<void> {
    this.saving = this.saving.then(async () => {
      const task = this.task();
      if (!task) {
        return;
      }
      this.failed.set(false);
      this.status.set('');
      try {
        await this.actions.update(task, typeof changes === 'function' ? changes(task) : changes);
      } catch {
        this.failed.set(true);
        this.status.set('Změnu se nepodařilo uložit.');
      }
      await this.load();
    });
    return this.saving;
  }

  private async load(): Promise<boolean> {
    try {
      const task = await this.repository.get(this.id());
      this.task.set(task && !task.deletedAt ? task : undefined);
      return this.task() !== undefined;
    } catch {
      this.failed.set(true);
      this.status.set('Úkol se nepodařilo načíst.');
      return true;
    }
  }
}
