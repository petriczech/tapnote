import { Component, ElementRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router } from '@angular/router';
import { Undo } from './undo';

// Jediná lišta Zpět v kostře aplikace; oblast role="status" je v DOM stále, aby čtečka ohlásila každou novou zprávu
@Component({
  selector: 'tn-undo-bar',
  host: {
    role: 'status',
    'aria-live': 'polite',
    '(focusin)': 'undo.hold()',
    '(focusout)': 'release()',
    '(pointerenter)': 'hover($event)',
    '(pointerleave)': 'release()',
  },
  template: `
    @if (undo.message(); as message) {
      <div class="bar">
        <span>{{ message.text }}</span>
        @if (message.undo) {
          <button type="button" (click)="undo.undo()">Zpět</button>
        }
      </div>
    }
  `,
  styles: `
    // Na mobilu nad FAB „Nový“ (ten sedí nad spodní lištou), od 900 px dole vedle levé kolejnice (FAB tam u úkolů není)
    :host {
      position: fixed;
      right: 12px;
      bottom: calc(170px + env(safe-area-inset-bottom));
      left: 12px;
      z-index: 2;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }

    @media (min-width: 900px) {
      :host {
        right: 24px;
        bottom: calc(24px + env(safe-area-inset-bottom));
        left: calc(108px + env(safe-area-inset-left));
      }
    }

    // Od 1200 px (kolejnice 256 px) jen nad sloupcem seznamu, detail úkolu vpravo (452 px) zůstane volný
    @media (min-width: 1200px) {
      :host {
        right: calc(452px + 24px);
        left: calc(280px + env(safe-area-inset-left));
      }
    }

    .bar {
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      width: 100%;
      max-width: 560px;
      min-height: 52px;
      padding: 4px 4px 4px 16px;
      border: 1px solid var(--outline-variant);
      border-radius: var(--radius-m);
      background: var(--surface-high);
      color: var(--on-surface);
      box-shadow: 0 3px 8px rgb(0 0 0 / 25%);
      pointer-events: auto;
      animation: rise 0.2s ease-out;
    }

    span {
      flex: 1;
    }

    button {
      min-width: var(--target);
      min-height: var(--target);
      padding: 0 16px;
      border: 0;
      border-radius: var(--radius-s);
      background: none;
      color: var(--primary);
      font: inherit;
      font-weight: 600;
    }

    @keyframes rise {
      from {
        transform: translateY(8px);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .bar {
        animation: none;
      }
    }

    @media (forced-colors: active) {
      .bar {
        border-color: CanvasText;
      }
    }
  `,
})
export class UndoBar {
  protected readonly undo = inject(Undo);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    // Lišta patří k obrazovce, kde vznikla: navigací se skryje (jinde by překryla FAB nebo tlačítko Ze šablony)
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) {
          this.undo.hide();
        }
      });
  }

  // Drží jen myš; klepnutí prstem by lištu drželo až do dalšího klepnutí jinam
  protected hover(event: PointerEvent): void {
    if (event.pointerType === 'mouse') {
      this.undo.hold();
    }
  }

  // Čas běží znovu po odchodu myši nebo fokusu, s fokusem v liště ne
  protected release(): void {
    if (!this.host.contains(document.activeElement)) {
      this.undo.release();
    }
  }
}
