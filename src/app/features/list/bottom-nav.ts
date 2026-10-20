import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotesView } from '../../core/model/note-query';
import { VIEWS } from './views';

@Component({
  selector: 'tn-bottom-nav',
  imports: [RouterLink],
  template: `
    <nav aria-label="Pohledy">
      <a routerLink="/tasks" [attr.aria-current]="current() === 'tasks' ? 'page' : null" (click)="leave.emit()">
        <span class="pill">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
            />
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
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="item.icon" /></svg>
          </span>
          {{ item.label }}
        </a>
      }
      <a routerLink="/settings" [attr.aria-current]="current() === 'settings' ? 'page' : null" (click)="leave.emit()">
        <span class="pill">
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
            />
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
  readonly current = input.required<NotesView | 'tasks' | 'settings'>();
  // Hledání, které se drží při přepnutí pohledu
  readonly q = input<string | null>(null);
  // Před odchodem se uloží rozepsané hledání
  readonly leave = output();

  protected readonly views = VIEWS;
}
