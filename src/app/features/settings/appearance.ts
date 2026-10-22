import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICONS, ICONS_FILL, ICONS_REGULAR } from '../../core/icons/icons';
import {
  applyAmbient,
  applyScheme,
  applyTheme,
  readAmbient,
  readScheme,
  readTheme,
  SchemeId,
  SCHEMES,
  ThemeId,
  THEMES,
} from '../../core/theme/theme';
import { BottomNav } from '../list/bottom-nav';

// Podstránka Nastavení › Vzhled (obrazovka 05 návrhu D): režim, motiv, ukázka a ambientní přechody
@Component({
  selector: 'tn-appearance',
  imports: [BottomNav, RouterLink],
  template: `
    <header class="app-bar">
      <a class="crumbs" routerLink="/settings">
        Nastavení
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.caretRight" /></svg>
      </a>
      <h1 tabindex="-1">Vzhled</h1>
    </header>

    <fieldset>
      <legend><h2>Režim</h2></legend>
      <div class="schemes">
        @for (item of schemes; track item.id) {
          <label>
            <input type="radio" name="scheme" [value]="item.id" [checked]="scheme() === item.id" (change)="setScheme(item.id)" />
            {{ item.label }}
          </label>
        }
      </div>
    </fieldset>

    <fieldset>
      <legend><h2>Motiv</h2></legend>
      <div class="themes">
        @for (item of themes; track item.id) {
          <label class="theme">
            <input type="radio" name="theme" [value]="item.id" [checked]="theme() === item.id" (change)="setTheme(item.id)" />
            <span
              class="preview"
              aria-hidden="true"
              [style.--bg]="item.preview[0]"
              [style.--card]="item.preview[1]"
              [style.--accent]="item.preview[2]"
            >
              <span class="pt"></span>
              <span class="pr"></span>
              <span class="pr"></span>
              <span class="pf"></span>
            </span>
            <span class="theme-name">
              {{ item.label }}
              @if (theme() === item.id) {
                <svg class="tick" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="checkIcon" /></svg>
              }
            </span>
          </label>
        }
      </div>
    </fieldset>

    <!-- Ukázka je jen obrázek řádku úkolu v aktuálním vzhledu, čtečka ji přeskočí -->
    <p class="section-h" aria-hidden="true">Ukázka</p>
    <div class="card">
      <div class="sample" aria-hidden="true">
        <span class="dot"></span>
        <span class="body">
          <span class="title">Zaplatit nájem za říjen</span>
          <span class="meta"><b>Dnes</b> Domov</span>
        </span>
        <svg class="icon star" viewBox="0 0 256 256"><path [attr.d]="starIcon" /></svg>
      </div>

      <!-- Záře je jen v Noiru, proto se přepínač ukazuje jen tam -->
      @if (theme() === 'noir') {
        <label class="switch-row">
          Ambientní přechody
          <input
            #ambientBox
            class="switch"
            type="checkbox"
            role="switch"
            aria-describedby="ambient-hint"
            [checked]="ambient()"
            (change)="setAmbient(ambientBox.checked)"
          />
        </label>
        <p id="ambient-hint" class="info">Barevná záře za skleněnými panely</p>
      }
    </div>

    <tn-bottom-nav current="settings" />
  `,
  styleUrl: './appearance.scss',
})
export class Appearance {
  protected readonly icons = ICONS_REGULAR;
  protected readonly checkIcon = ICONS.check;
  protected readonly starIcon = ICONS_FILL.star;
  protected readonly themes = THEMES;
  protected readonly theme = signal(readTheme());
  protected readonly schemes = SCHEMES;
  protected readonly scheme = signal(readScheme());
  protected readonly ambient = signal(readAmbient());
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    // Po přechodu z rozcestníku se fokus přesune na nadpis podstránky, jinak by spadl na body
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus());
  }

  protected setTheme(theme: ThemeId): void {
    applyTheme(theme);
    this.theme.set(theme);
  }

  protected setAmbient(on: boolean): void {
    applyAmbient(on);
    this.ambient.set(on);
  }

  protected setScheme(scheme: SchemeId): void {
    applyScheme(scheme);
    this.scheme.set(scheme);
  }
}
