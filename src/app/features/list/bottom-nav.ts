import { NgOptimizedImage } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NotesView } from '../../core/model/note-query';
import { VIEWS } from './views';
import { ICONS, ICONS_REGULAR } from '../../core/icons/icons';

@Component({
  selector: 'tn-bottom-nav',
  imports: [NgOptimizedImage, RouterLink],
  template: `
    <a class="skip" href="#obsah" (click)="skip($event)">Přeskočit na obsah</a>
    <p class="brand"><img ngSrc="icons/icon-96x96.png" width="32" height="32" alt="" /><span>Tapnote</span></p>
    <a class="action new" routerLink="/new" (click)="leave.emit()">
      <span class="tile"><svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="bold.plus" /></svg></span>
      Nová poznámka
    </a>
    <a class="action today" routerLink="/today" (click)="leave.emit()">
      <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.calendar" /></svg>
      Dnešní poznámka
    </a>
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

    // „Přeskočit na obsah“ je vidět jen s fokusem; v panelu se sklem se kotví k panelu, jinak k oknu
    .skip {
      position: fixed;
      top: 8px;
      left: 8px;
      z-index: 3;
      width: max-content;
      padding: 0 16px;
      border: 1px solid var(--outline);
      border-radius: 12px;
      background: var(--surface-high);
      color: var(--on-surface);
      font-size: 1rem;
      font-weight: 600;
    }

    .skip:not(:focus) {
      transform: translateY(-200%);
    }

    // Značka a akce panelu se pod 900 px skryjí (na mobilu je nese hlavička a FAB)
    .brand,
    .action {
      display: none;
    }

    // Od 900 px se z lišty stane levá kolejnice 84 px: ikona a popisek 12 px, Nastavení dole
    @media (min-width: 900px) {
      :host {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        z-index: 2;
        display: flex;
        flex-direction: column;
        gap: 2px;
        box-sizing: border-box;
        width: 84px;
        padding: 14px 8px calc(14px + env(safe-area-inset-bottom));
        border-right: 1px solid var(--nav-border);
        background: var(--nav-bg);
        backdrop-filter: var(--glass-blur);
      }

      // Na nízkém okně (telefon na šířku, zoom) se pohledy posouvají; okraje drží proužek i obrys fokusu uvnitř
      nav {
        position: static;
        flex: 1;
        flex-direction: column;
        max-width: none;
        min-height: 0;
        margin: -4px -8px;
        padding: 4px 8px;
        overflow-y: auto;
        scrollbar-width: thin;
        border: 0;
        border-radius: 0;
        background: none;
        backdrop-filter: none;
        box-shadow: none;
      }

      nav a,
      .action {
        position: relative;
        display: flex;
        flex: none;
        min-height: 60px;
        padding: 6px 2px;
        text-align: center;
      }

      nav a:last-child {
        margin-top: auto;
      }

      .today {
        margin-bottom: 14px;
      }

      .brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 44px;
        margin: 0 0 8px;
        font-size: 1.125rem;
        font-weight: 800;
        letter-spacing: -0.03em;
      }

      .brand img {
        border-radius: 9px;
      }

      .brand span {
        display: none;
      }

      .tile {
        display: grid;
        place-items: center;
        width: 44px;
        height: 36px;
        border-radius: 14px;
        background: var(--fab-bg);
        color: var(--fab-text);
      }

      // Proužek aktivního odkazu je na boku svislý
      .pip {
        position: absolute;
        top: 12px;
        bottom: 12px;
        left: -8px;
        height: auto;
        border-radius: 0 4px 4px 0;
      }

      a[aria-current] .pip {
        width: 4px;
      }
    }

    // Od 1200 px panel 256 px s popisky vedle ikon a „Nová poznámka“ jako tlačítko s přechodem
    @media (min-width: 1200px) {
      :host {
        width: 256px;
        padding: 18px 12px calc(16px + env(safe-area-inset-bottom));
      }

      nav a,
      .action {
        flex-direction: row;
        justify-content: flex-start;
        gap: 12px;
        min-height: 44px;
        padding: 0 12px;
        border-radius: 12px;
        font-size: 0.9375rem;
        text-align: left;
      }

      nav {
        margin-inline: -12px;
        padding-inline: 12px;
      }

      .brand {
        justify-content: flex-start;
        padding: 0 6px;
      }

      .brand span {
        display: inline;
      }

      .new {
        min-height: 48px;
        margin-bottom: 6px;
        border-radius: var(--fab-radius);
        background: var(--fab-bg);
        color: var(--fab-text);
        font-weight: 600;
      }

      .tile {
        display: contents;
      }

      .pip {
        left: -12px;
      }
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
  protected readonly bold = ICONS;
  readonly current = input.required<NotesView | 'tasks' | 'settings'>();
  // Hledání, které se drží při přepnutí pohledu
  readonly q = input<string | null>(null);
  // Před odchodem se uloží rozepsané hledání
  readonly leave = output();

  protected readonly views = VIEWS;

  // Fokus se přesune na začátek obsahu stránky bez změny URL (fragment by spustil navigaci routeru)
  protected skip(event: Event): void {
    event.preventDefault();
    document.getElementById('obsah')?.focus();
  }
}
