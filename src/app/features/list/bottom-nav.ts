import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotesView } from '../../core/model/note-query';
import { VIEWS } from './views';
import { ICONS_REGULAR } from '../../core/icons/icons';

@Component({
  selector: 'tn-bottom-nav',
  imports: [RouterLink],
  template: `
    <nav aria-label="Pohledy">
      <a routerLink="/tasks" [attr.aria-current]="current() === 'tasks' ? 'page' : null" (click)="leave.emit()">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.tasks" /></svg>
        Úkoly
        <span class="pip"></span>
      </a>
      @for (item of views; track item.view) {
        <a
          routerLink="/notes"
          [queryParams]="{ view: item.view === 'notes' ? null : item.view, q: q() }"
          [attr.aria-current]="item.view === current() ? 'page' : null"
          (click)="leave.emit()"
        >
          <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons[item.icon]" /></svg>
          {{ item.label }}
          <span class="pip"></span>
        </a>
      }
      <a routerLink="/settings" [attr.aria-current]="current() === 'settings' ? 'page' : null" (click)="leave.emit()">
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.settings" /></svg>
        Nastavení
        <span class="pip"></span>
      </a>
    </nav>
  `,
  styles: `
    // Plovoucí lišta jako v návrhu D; nad gesture barem drží odstup safe area
    nav {
      position: fixed;
      right: 12px;
      bottom: calc(14px + env(safe-area-inset-bottom));
      left: 12px;
      display: flex;
      gap: 2px;
      box-sizing: border-box;
      max-width: 560px;
      min-height: 72px;
      margin: 0 auto;
      padding: 6px;
      border: 1px solid var(--nav-border);
      border-radius: var(--radius-l);
      background: var(--nav-bg);
      backdrop-filter: var(--glass-blur);
      box-shadow: var(--card-shadow);
    }

    // Na úzkém displeji (320 px) se okraje zúží, aby se „Nastavení“ vešlo do záložky
    @media (max-width: 359px) {
      nav {
        right: 8px;
        left: 8px;
        gap: 0;
        padding-inline: 2px;
      }
    }

    a {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-width: 0;
      min-height: 44px;
      border-radius: 18px;
      color: var(--on-surface-variant);
      font-size: 0.75rem;
      font-weight: 500;
      text-decoration: none;
    }

    .pip {
      width: 4px;
      height: 4px;
      border-radius: 4px;
    }

    // Aktivní stav nese barva ikony, tučný popisek a přechodový proužek (v ostatních vzhledech plná primary)
    a[aria-current] {
      background: var(--outline-variant);
      color: var(--on-surface);
      font-weight: 600;
    }

    a[aria-current] .icon {
      color: var(--primary);
    }

    a[aria-current] .pip {
      width: 16px;
      background: var(--nav-pip);
    }

    @media (forced-colors: active) {
      a[aria-current] .pip {
        background: Highlight;
        forced-color-adjust: none;
      }
    }
  `,
})
export class BottomNav {
  protected readonly icons = ICONS_REGULAR;
  readonly current = input.required<NotesView | 'tasks' | 'settings'>();
  // Hledání, které se drží při přepnutí pohledu
  readonly q = input<string | null>(null);
  // Před odchodem se uloží rozepsané hledání
  readonly leave = output();

  protected readonly views = VIEWS;
}
