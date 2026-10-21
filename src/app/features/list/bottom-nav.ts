import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotesView } from '../../core/model/note-query';
import { VIEWS } from './views';
import { ICONS, ICONS_FILL } from '../../core/icons/icons';

@Component({
  selector: 'tn-bottom-nav',
  imports: [RouterLink],
  template: `
    <nav aria-label="Pohledy">
      <a routerLink="/tasks" [attr.aria-current]="current() === 'tasks' ? 'page' : null" (click)="leave.emit()">
        <span class="pill">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
            <path [attr.d]="current() === 'tasks' ? iconsFill.tasks : icons.tasks" />
          </svg>
        </span>
        Úkoly
      </a>
      @for (item of views; track item.view) {
        <a
          routerLink="/notes"
          [queryParams]="{ view: item.view === 'notes' ? null : item.view, q: q() }"
          [attr.aria-current]="item.view === current() ? 'page' : null"
          (click)="leave.emit()"
        >
          <span class="pill">
            <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="item.view === current() ? iconsFill[item.icon] : icons[item.icon]" /></svg>
          </span>
          {{ item.label }}
        </a>
      }
      <a routerLink="/settings" [attr.aria-current]="current() === 'settings' ? 'page' : null" (click)="leave.emit()">
        <span class="pill">
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true">
            <path [attr.d]="current() === 'settings' ? iconsFill.settings : icons.settings" />
          </svg>
        </span>
        Nastavení
      </a>
    </nav>
  `,
  styles: `
    nav {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      display: flex;
      justify-content: space-around;
      box-sizing: border-box;
      height: calc(80px + env(safe-area-inset-bottom));
      padding: 12px 0 env(safe-area-inset-bottom);
      border-top: 1px solid var(--nav-border);
      background: var(--nav-bg);
    }

    a {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      max-width: 96px;
      color: var(--on-surface-variant);
      font-size: 0.75rem;
      text-decoration: none;
    }

    .pill {
      display: flex;
      justify-content: center;
      width: 64px;
      padding: 4px 0;
      border-radius: 16px;
    }

    a[aria-current] {
      color: var(--on-surface);
      font-weight: 600;
    }

    a[aria-current] .pill {
      background: var(--primary-container);
      color: var(--on-primary-container);
    }
  `,
})
export class BottomNav {
  protected readonly icons = ICONS;
  protected readonly iconsFill = ICONS_FILL;
  readonly current = input.required<NotesView | 'tasks' | 'settings'>();
  // Hledání, které se drží při přepnutí pohledu
  readonly q = input<string | null>(null);
  // Před odchodem se uloží rozepsané hledání
  readonly leave = output();

  protected readonly views = VIEWS;
}
