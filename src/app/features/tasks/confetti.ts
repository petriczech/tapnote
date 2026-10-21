import { Component, input } from '@angular/core';

// Krátký výbuch barevných teček na místě dokončeného úkolu; jen dekorace, bez animací se nezobrazí
@Component({
  selector: 'tn-confetti',
  host: { 'aria-hidden': 'true', '[style.left.px]': 'x()', '[style.top.px]': 'y()' },
  template: `
    @for (dot of dots; track dot) {
      <i [style.--angle]="dot * 45 + 'deg'"></i>
    }
  `,
  styles: `
    :host {
      position: fixed;
      z-index: 10;
      width: 0;
      height: 0;
      pointer-events: none;
    }

    i {
      position: absolute;
      top: -4px;
      left: -4px;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--c-violet);
      animation: burst 0.7s ease-out forwards;
    }

    i:nth-child(4n + 1) {
      background: #ffc53d;
    }

    i:nth-child(4n + 2) {
      background: var(--c-green);
    }

    i:nth-child(4n + 3) {
      background: var(--c-pink);
    }

    @keyframes burst {
      from {
        transform: rotate(var(--angle)) translateY(0) scale(1);
        opacity: 1;
      }

      to {
        transform: rotate(var(--angle)) translateY(-34px) scale(0.4);
        opacity: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        display: none;
      }
    }
  `,
})
export class Confetti {
  readonly x = input.required<number>();
  readonly y = input.required<number>();

  protected readonly dots = [0, 1, 2, 3, 4, 5, 6, 7];
}
