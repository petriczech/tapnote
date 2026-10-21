import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, Injector, input, OnInit, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Category } from '../../core/model/category';
import { categoryIconPath } from '../../core/model/category-icons';
import { Task } from '../../core/model/task';
import { addDays, dueLabel, isTasksView, localDate, queryTasks, TASK_VIEWS, TasksView } from '../../core/model/task-query';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { NewTaskFields, TaskActions } from '../../core/tasks/task-actions';
import { BottomNav } from '../list/bottom-nav';
import { Confetti } from './confetti';
import { ICONS, ICONS_FILL } from '../../core/icons/icons';

// Délka animace konfet (tn-confetti), pak se prvek odstraní
const CONFETTI_MS = 800;

@Component({
  selector: 'tn-tasks-page',
  imports: [BottomNav, Confetti, NgTemplateOutlet, RouterLink],
  host: { '(document:visibilitychange)': 'refreshToday()' },
  template: `
    <header class="header">
      <div class="app-bar">
        <div>
          <p class="eyebrow">{{ dateLine() }}</p>
          <h1 tabindex="-1">{{ heading()[0] }}@if (heading()[1]) {<span class="title-accent">{{ heading()[1] }}</span>}</h1>
        </div>
        @if (progress().total > 0) {
          <span class="ring" role="img" [attr.aria-label]="'Hotovo ' + progress().done + ' z ' + progress().total">
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <circle class="track" cx="26" cy="26" r="22" pathLength="100" />
              <circle class="value" cx="26" cy="26" r="22" pathLength="100" [attr.stroke-dasharray]="progress().dash + ' 100'" />
            </svg>
            <span aria-hidden="true">{{ progress().done }}/{{ progress().total }}</span>
          </span>
        }
      </div>
      <nav class="views" aria-label="Pohledy úkolů">
        @for (item of views; track item.view) {
          <a
            routerLink="/tasks"
            queryParamsHandling="merge"
            [queryParams]="{ view: item.view === 'today' ? null : item.view }"
            [attr.aria-current]="item.view === current().view ? 'page' : null"
          >
            {{ item.label }} <span class="count">{{ counts()[item.view] }}</span>
          </a>
        }
      </nav>
      @if (categories().length > 0) {
        <nav class="filters" aria-label="Kategorie">
          <a
            routerLink="/tasks"
            queryParamsHandling="merge"
            [queryParams]="{ category: null }"
            [attr.aria-current]="filter() === undefined ? 'true' : null"
            >Vše</a
          >
          @for (item of categories(); track item.id) {
            <a
              routerLink="/tasks"
              queryParamsHandling="merge"
              [queryParams]="{ category: item.id }"
              [style.--cat]="catVar(item)"
              [attr.aria-current]="filter()?.id === item.id ? 'true' : null"
            >
              <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(item.icon)" /></svg>
              {{ item.name }}
            </a>
          }
        </nav>
      }
    </header>

    <form class="add" (submit)="add($event, title)">
      <input
        #title
        aria-label="Nový úkol"
        placeholder="Přidat úkol…"
        autocomplete="off"
        [value]="draft()"
        (input)="draft.set(title.value)"
      />
      <button type="submit" class="add-btn" aria-label="Přidat úkol" [attr.aria-disabled]="!draft().trim()">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>
      </button>
    </form>

    <div class="quick" role="group" aria-label="Vlastnosti nového úkolu">
      <button type="button" class="chip" popovertarget="due-menu" [class.set]="due() !== undefined">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.calendar" /></svg>
        {{ due() === undefined ? 'Termín' : dueText(due()!) }}
      </button>
      <div id="due-menu" class="menu" popover (toggle)="onMenuToggle($event)">
        <button type="button" (click)="setDue(today(), dueMenu)">Dnes</button>
        <button type="button" (click)="setDue(tomorrow(), dueMenu)">Zítra</button>
        <button type="button" (click)="setDue(nextWeek(), dueMenu)">Příští týden</button>
        <label class="pick">
          Vybrat datum
          <input #date type="date" [min]="today()" (change)="setDue(date.value || undefined, dueMenu)" />
        </label>
        @if (due() !== undefined) {
          <button type="button" (click)="setDue(undefined, dueMenu)">Bez termínu</button>
        }
      </div>
      <button type="button" class="chip" popovertarget="category-menu" [class.set]="chosenCategory() !== undefined">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.tag" /></svg>
        {{ chosenCategory()?.name ?? 'Kategorie' }}
      </button>
      <div id="category-menu" class="menu" popover (toggle)="onMenuToggle($event)">
        @for (item of categories(); track item.id) {
          <button type="button" (click)="setCategory(item, categoryMenu)">
            <svg class="icon cat-icon" viewBox="0 0 256 256" aria-hidden="true" [style.--cat]="catVar(item)">
              <path [attr.d]="iconPath(item.icon)" />
            </svg>
            {{ item.name }}
          </button>
        } @empty {
          <p class="none" tabindex="-1">Zatím žádné kategorie</p>
        }
        @if (chosenCategory() !== undefined) {
          <button type="button" (click)="setCategory(undefined, categoryMenu)">Bez kategorie</button>
        }
      </div>
      <button type="button" class="chip" [class.set]="important()" [attr.aria-pressed]="important()" (click)="important.set(!important())">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="important() ? iconsFill.star : icons.star" /></svg>
        Důležité
      </button>
    </div>

    <p class="visually-hidden" aria-live="polite">{{ announcement() }}</p>
    @if (loadFailed()) {
      <p class="error" role="alert">Úkoly se nepodařilo načíst.</p>
    }
    @if (actionFailed()) {
      <p class="error" role="alert">Akci se nepodařilo dokončit.</p>
    }

    <ng-template #row let-task>
      <li
        [attr.data-id]="task.id"
        [class.done]="task.done"
        [class.hot]="!task.done && task.important"
        [class.late]="!task.done && task.dueDate && task.dueDate < today()"
        [style.--cat]="catVar(categoryOf(task))"
      >
        <input type="checkbox" class="check" [checked]="task.done" [attr.aria-label]="'Hotovo: ' + task.title" (change)="toggleDone(task, $event)" />
        <div class="body">
          <a class="title" [routerLink]="['/task', task.id]">{{ task.title }}</a>
          @if (meta(task)) {
            <span class="meta">
              @if (task.dueDate) {
                <span [class.today]="task.dueDate === today()" [class.overdue]="!task.done && task.dueDate < today()">{{
                  dueText(task.dueDate)
                }}</span>
              }
              @if (categoryOf(task); as item) {
                <span class="cat">
                  <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="iconPath(item.icon)" /></svg>{{ item.name }}
                </span>
              }
              @if (task.steps.length > 0) {
                <span>{{ doneSteps(task) }}/{{ task.steps.length }}</span>
              }
            </span>
          }
        </div>
        <button
          type="button"
          class="icon-btn star"
          [class.on]="task.important"
          [attr.aria-pressed]="task.important"
          [attr.aria-label]="'Důležité: ' + task.title"
          (click)="toggleImportant(task)"
        >
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="task.important ? iconsFill.star : icons.star" /></svg>
        </button>
      </li>
    </ng-template>

    @if (loaded() && list().open.length === 0 && list().done.length === 0) {
      <p class="empty">{{ current().empty }}</p>
    }
    @if (list().open.length > 0) {
      <ul class="tasks" aria-label="Úkoly">
        @for (task of list().open; track task.id) {
          <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: task }" />
        }
      </ul>
    }
    @if (list().done.length > 0) {
      <details class="done-section">
        <summary>Hotové ({{ list().done.length }})</summary>
        <ul class="tasks" aria-label="Hotové úkoly">
          @for (task of list().done; track task.id) {
            <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ $implicit: task }" />
          }
        </ul>
      </details>
    }

    @if (burst(); as burst) {
      <tn-confetti [x]="burst.x" [y]="burst.y" />
    }

    <button type="button" class="fab" aria-label="Přidat nový úkol" (click)="focusAdd(title)">
      <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.plus" /></svg>
      Nový
    </button>

    <tn-bottom-nav current="tasks" />
  `,
  styleUrl: './tasks-page.scss',
})
export class TasksPage implements OnInit {
  protected readonly icons = ICONS;
  protected readonly iconsFill = ICONS_FILL;
  readonly view = input<string>();
  // Filtr podle kategorie z ?category=
  readonly category = input<string>();

  private readonly repository = inject(TasksRepository);
  private readonly categoriesRepository = inject(CategoriesRepository);
  private readonly actions = inject(TaskActions);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly views = TASK_VIEWS;

  protected readonly tasks = signal<Task[]>([]);
  protected readonly categories = signal<Category[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadFailed = signal(false);
  protected readonly actionFailed = signal(false);
  protected readonly announcement = signal('');
  // Místo konfet po dokončení úkolu
  protected readonly burst = signal<{ x: number; y: number } | undefined>(undefined);
  private burstTimer?: ReturnType<typeof setTimeout>;
  private midnightTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.burstTimer);
      clearTimeout(this.midnightTimer);
    });
  }
  protected readonly today = signal(localDate(new Date()));
  protected readonly tomorrow = computed(() => addDays(this.today(), 1));
  protected readonly nextWeek = computed(() => addDays(this.today(), 7));

  // Rozepsaný úkol a vlastnosti z čipů
  protected readonly draft = signal('');
  protected readonly due = signal<string | undefined>(undefined);
  protected readonly chosenCategory = signal<Category | undefined>(undefined);
  protected readonly important = signal(false);

  protected readonly current = computed(() => {
    const view = this.view();
    return TASK_VIEWS.find((item) => item.view === (isTasksView(view) ? view : 'today')) ?? TASK_VIEWS[0];
  });
  // Nadpis: poslední slovo víceslovného názvu dostane akcent („Můj den“)
  protected readonly heading = computed(() => {
    const label = this.current().label;
    const space = label.lastIndexOf(' ') + 1;
    return space ? [label.slice(0, space), label.slice(space)] : [label, ''];
  });
  // Datum nad nadpisem („úterý 20. října“, verzálky dodá CSS)
  protected readonly dateLine = computed(() => {
    const [year, month, day] = this.today().split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  });
  protected readonly iconPath = categoryIconPath;
  protected readonly filter = computed(() => this.categories().find((item) => item.id === this.category()));
  private readonly filtered = computed(() => {
    const filter = this.filter();
    return filter ? this.tasks().filter((task) => task.categoryId === filter.id) : this.tasks();
  });
  protected readonly list = computed(() => queryTasks(this.filtered(), this.current().view, this.today()));
  protected readonly counts = computed(
    () =>
      Object.fromEntries(
        TASK_VIEWS.map((item) => [item.view, queryTasks(this.filtered(), item.view, this.today()).open.length]),
      ) as Record<TasksView, number>,
  );
  protected readonly progress = computed(() => {
    const { open, done } = this.list();
    const total = open.length + done.length;
    return { done: done.length, total, dash: total ? Math.round((done.length / total) * 100) : 0 };
  });

  ngOnInit(): Promise<void> {
    this.refreshToday();
    return this.load();
  }

  protected get dueMenu(): HTMLElement {
    return this.host.querySelector('#due-menu') as HTMLElement;
  }

  protected get categoryMenu(): HTMLElement {
    return this.host.querySelector('#category-menu') as HTMLElement;
  }

  protected dueText(date: string): string {
    return dueLabel(date, this.today());
  }

  protected categoryOf(task: Task): Category | undefined {
    return this.categories().find((item) => item.id === task.categoryId);
  }

  protected catVar(category: Category | undefined): string | null {
    return category ? `var(--c-${category.color})` : null;
  }

  protected doneSteps(task: Task): number {
    return task.steps.filter((step) => step.done).length;
  }

  protected meta(task: Task): boolean {
    return task.dueDate !== undefined || this.categoryOf(task) !== undefined || task.steps.length > 0;
  }

  // Fokus na první položku otevřené nabídky
  protected onMenuToggle(event: Event): void {
    if ('newState' in event && event.newState === 'open') {
      (event.target as HTMLElement).querySelector<HTMLElement>('button, input, [tabindex]')?.focus();
    }
  }

  protected setDue(date: string | undefined, menu: HTMLElement): void {
    this.due.set(date);
    menu.hidePopover?.();
  }

  protected setCategory(category: Category | undefined, menu: HTMLElement): void {
    this.chosenCategory.set(category);
    menu.hidePopover?.();
  }

  // Pole pro nový úkol se posune do středu a dostane fokus (na telefonu se otevře klávesnice)
  protected focusAdd(input: HTMLInputElement): void {
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    input.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    input.focus({ preventScroll: true });
  }

  // Výchozí vlastnosti podle pohledu; fokus zůstane v poli pro další úkol
  protected async add(event: Event, input: HTMLInputElement): Promise<void> {
    event.preventDefault();
    const title = this.draft().trim();
    if (!title) {
      return;
    }
    this.refreshToday();
    const view = this.current().view;
    const dueDate = this.due() ?? (view === 'planned' ? this.today() : undefined);
    // Bez čipu dostane úkol kategorii z filtru
    const category = this.chosenCategory() ?? this.filter();
    const fields: NewTaskFields = {
      ...(view === 'today' ? { myDay: this.today() } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(this.important() || view === 'important' ? { important: true } : {}),
      ...(category ? { categoryId: category.id } : {}),
    };
    // Pole se vyprázdní hned (druhý Enter nic nepřidá); přímo, protože draft se mohl změnit tam a zpět bez detekce změn
    input.value = '';
    this.draft.set('');
    if (await this.run(() => this.actions.add(title, fields))) {
      this.due.set(undefined);
      this.chosenCategory.set(undefined);
      this.important.set(false);
      this.announcement.set(`Úkol ${title} přidán`);
    } else {
      input.value = title;
      this.draft.set(title);
    }
  }

  protected async toggleDone(task: Task, event?: Event): Promise<void> {
    const index = this.list().open.findIndex((item) => item.id === task.id);
    // Konfety ze středu kroužku jen při dokončení
    const rect = event?.target instanceof HTMLElement ? event.target.getBoundingClientRect() : undefined;
    if (await this.run(() => this.actions.toggleDone(task))) {
      this.announcement.set(task.done ? `Úkol ${task.title} znovu otevřen` : `Úkol ${task.title} hotov`);
      if (!task.done && rect) {
        this.celebrate(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    } else if (event?.target instanceof HTMLInputElement) {
      // Při chybě uložení se zaškrtnutí vrátí podle uloženého stavu
      event.target.checked = task.done;
    }
    this.focusTask(task.id, '.check', index);
  }

  protected async toggleImportant(task: Task): Promise<void> {
    const index = this.list().open.findIndex((item) => item.id === task.id);
    if (await this.run(() => this.actions.toggleImportant(task))) {
      this.announcement.set(task.important ? `Úkol ${task.title} už není důležitý` : `Úkol ${task.title} je důležitý`);
    }
    this.focusTask(task.id, '.star', index);
  }

  private celebrate(x: number, y: number): void {
    clearTimeout(this.burstTimer);
    this.burst.set({ x, y });
    this.burstTimer = setTimeout(() => this.burst.set(undefined), CONFETTI_MS);
  }

  // Po návratu do aplikace (třeba druhý den) a o půlnoci se přepočítá dnešek
  protected refreshToday(): void {
    const now = new Date();
    this.today.set(localDate(now));
    clearTimeout(this.midnightTimer);
    this.midnightTimer = setTimeout(() => this.refreshToday(), new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime());
  }

  private async run(action: () => Promise<unknown>): Promise<boolean> {
    this.actionFailed.set(false);
    try {
      await action();
      return true;
    } catch {
      this.actionFailed.set(true);
      return false;
    } finally {
      await this.load();
    }
  }

  // Úkol se po změně může přesunout (do sbalených Hotových, z pohledu Důležité): fokus pak na otevřený úkol
  // na stejné pozici, bez úkolů na nadpis
  private focusTask(id: string, selector: string, index: number): void {
    afterNextRender(
      () => {
        const target = this.host.querySelector<HTMLElement>(`li[data-id="${id}"] ${selector}`);
        const open = [...this.host.querySelectorAll<HTMLElement>('ul[aria-label="Úkoly"] li')];
        const neighbour = open[Math.min(Math.max(index, 0), open.length - 1)]?.querySelector<HTMLElement>(selector);
        const visible = target && !target.closest('details:not([open])');
        (visible ? target : (neighbour ?? this.host.querySelector<HTMLElement>('h1')))?.focus();
      },
      { injector: this.injector },
    );
  }

  private async load(): Promise<void> {
    try {
      const [tasks, categories] = await Promise.all([this.repository.getAll(), this.categoriesRepository.getAll()]);
      this.tasks.set(tasks);
      this.categories.set(categories);
      this.loaded.set(true);
      this.loadFailed.set(false);
    } catch {
      this.loadFailed.set(true);
    }
  }
}
