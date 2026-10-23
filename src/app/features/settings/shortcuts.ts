import { afterNextRender, Component, ElementRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ICONS_REGULAR } from '../../core/icons/icons';
import { readShortcutsEnabled, SHORTCUTS, writeShortcutsEnabled } from '../../core/shortcuts/shortcuts';
import { BottomNav } from '../list/bottom-nav';

// Podstránka Nastavení › Klávesové zkratky: přepínač a přehled zkratek
@Component({
  selector: 'tn-shortcuts',
  imports: [BottomNav, RouterLink],
  template: `
    <tn-bottom-nav current="settings" />

    <header id="obsah" class="app-bar" tabindex="-1">
      <a class="crumbs" routerLink="/settings">
        Nastavení
        <svg class="icon" viewBox="0 0 256 256" aria-hidden="true"><path [attr.d]="icons.caretRight" /></svg>
      </a>
      <h1 tabindex="-1">Klávesové zkratky</h1>
    </header>

    <div class="card">
      <label class="check">
        <input #shortcutsBox type="checkbox" [checked]="shortcuts()" (change)="setShortcuts(shortcutsBox.checked)" />
        Zapnout klávesové zkratky
      </label>
      <table class="shortcuts">
        <thead>
          <tr>
            <th scope="col">Kde</th>
            <th scope="col">Klávesa</th>
            <th scope="col">Akce</th>
          </tr>
        </thead>
        <tbody>
          @for (item of shortcutList; track item.keys) {
            <tr>
              <td>{{ item.place }}</td>
              <td><kbd>{{ item.keys }}</kbd></td>
              <td>{{ item.label }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './shortcuts.scss',
})
export class Shortcuts {
  protected readonly icons = ICONS_REGULAR;
  protected readonly shortcutList = SHORTCUTS;
  protected readonly shortcuts = signal(readShortcutsEnabled());
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    // Po přechodu z rozcestníku, klávesou ? nebo z panelu se fokus přesune na nadpis podstránky
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus());
  }

  protected setShortcuts(enabled: boolean): void {
    writeShortcutsEnabled(enabled);
    this.shortcuts.set(enabled);
  }
}
