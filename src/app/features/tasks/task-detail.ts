import { afterNextRender, Component, computed, DestroyRef, ElementRef, inject, Injector, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Category } from '../../core/model/category';
import { Task, TaskStep } from '../../core/model/task';
import { localDate } from '../../core/model/task-query';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { TaskActions } from '../../core/tasks/task-actions';

type TaskChanges = Parameters<TaskActions['update']>[1];

// Text se ukládá průběžně po krátké pauze v psaní
const TEXT_DEBOUNCE_MS = 400;

@Component({
  selector: 'tn-task-detail',
  imports: [RouterLink],
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
    '(window:pagehide)': 'flushText()',
    '[style.--cat]': 'catVar()',
  },
  template: `
    <div class="toolbar">
      <a class="icon-btn" routerLink="/tasks" title="Úkoly">
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
        <span class="visually-hidden">Úkoly</span>
      </a>
      @if (task()) {
        <button type="button" class="text-btn danger" (click)="trash()">Smazat</button>
      }
    </div>

    @if (task(); as task) {
      <h1 class="visually-hidden" tabindex="-1">Detail úkolu</h1>
      <div class="head">
        <input type="checkbox" class="check" aria-label="Hotovo" [checked]="task.done" (change)="toggleDone()" />
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
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="task.important ? starIcon : starOutlineIcon" /></svg>
        </button>
      </div>

      <section class="steps" aria-labelledby="steps-heading">
        <h2 id="steps-heading">Kroky</h2>
        @if (task.steps.length > 0) {
          <ul>
            @for (step of task.steps; track step.id) {
              <li [class.done]="step.done">
                <input type="checkbox" class="check small" [checked]="step.done" [attr.aria-label]="step.title" (change)="toggleStep(step)" />
                <span class="step-title">{{ step.title }}</span>
                <button type="button" class="icon-btn" [attr.aria-label]="'Smazat krok: ' + step.title" (click)="removeStep(step)">
                  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
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

      <div class="fields">
        <button type="button" class="field" [class.on]="inMyDay()" (click)="toggleMyDay()">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2a1 1 0 0 0 0-2H2a1 1 0 0 0 0 2zm18 0h2a1 1 0 0 0 0-2h-2a1 1 0 0 0 0 2zM11 2v2a1 1 0 0 0 2 0V2a1 1 0 0 0-2 0zm0 18v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-2 0z"
            />
          </svg>
          {{ inMyDay() ? 'Přidáno do Můj den' : 'Přidat do Můj den' }}
        </button>
        <label class="field">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V10h14v10z" />
          </svg>
          Termín
          <input #due type="date" [value]="task.dueDate ?? ''" (change)="save({ dueDate: due.value || undefined })" />
        </label>
        <label class="field">
          <span class="dot" aria-hidden="true"></span>
          Kategorie
          <select #category (change)="save({ categoryId: category.value || undefined })">
            <option value="">Bez kategorie</option>
            @for (item of categories(); track item.id) {
              <option [value]="item.id" [selected]="item.id === task.categoryId">{{ item.name }}</option>
            }
          </select>
        </label>
        <label class="note">
          Poznámka
          <textarea #note rows="4" placeholder="Přidat poznámku" [value]="initialText().note" (input)="queueText('note', note.value)" (blur)="flushText()"></textarea>
        </label>
      </div>
    }

    <p class="status" [class.error]="failed()" aria-live="polite">{{ status() }}</p>
  `,
  styleUrl: './task-detail.scss',
})
export class TaskDetail implements OnInit {
  readonly id = input.required<string>();

  private readonly repository = inject(TasksRepository);
  private readonly categoriesRepository = inject(CategoriesRepository);
  private readonly actions = inject(TaskActions);
  private readonly router = inject(Router);

  protected readonly starIcon = 'M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';
  protected readonly starOutlineIcon =
    'm22 9.24-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z';
  protected readonly today = localDate(new Date());

  protected readonly task = signal<Task | undefined>(undefined);
  // Text polí jen z prvního načtení: další načtení by přepsalo, co se mezitím dopsalo
  protected readonly initialText = signal({ title: '', note: '' });
  protected readonly categories = signal<Category[]>([]);
  protected readonly status = signal('');
  protected readonly failed = signal(false);
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
    inject(DestroyRef).onDestroy(() => this.flushText());
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

  protected toggleDone(): Promise<void> {
    return this.save((task) => ({ done: !task.done, completedAt: task.done ? undefined : new Date().toISOString() }));
  }

  protected toggleImportant(): Promise<void> {
    return this.save((task) => ({ important: !task.important }));
  }

  protected toggleMyDay(): Promise<void> {
    return this.save((task) => ({ myDay: task.myDay === this.today ? undefined : this.today }));
  }

  protected queueText(field: 'title' | 'note', value: string): void {
    this.pendingText[field] = value;
    clearTimeout(this.textTimer);
    this.textTimer = setTimeout(() => this.flushText(), TEXT_DEBOUNCE_MS);
  }

  // Prázdný název se neuloží
  protected flushText(): Promise<void> {
    clearTimeout(this.textTimer);
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
      await this.router.navigate(['/tasks']);
    } catch {
      this.failed.set(true);
      this.status.set('Úkol se nepodařilo smazat.');
    }
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
