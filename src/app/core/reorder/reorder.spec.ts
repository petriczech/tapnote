import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Reorder, ReorderMove } from './reorder';

@Component({
  imports: [Reorder],
  template: `
    <ul [tnReorder]="names()" (moved)="moves.push($event)">
      @for (name of names(); track name) {
        <li>
          {{ name }}
          <button type="button" class="grip" [attr.aria-label]="'Přesunout: ' + name" aria-pressed="false">⠿</button>
        </li>
      }
    </ul>
    <button type="button" class="other">Jinam</button>
  `,
})
class Host {
  readonly names = signal(['Domov', 'Práce', 'Nákup']);
  readonly moves: ReorderMove[] = [];
}

describe('Reorder', () => {
  let fixture: ComponentFixture<Host>;
  let root: HTMLElement;

  const rows = () => [...root.querySelectorAll('li')];
  const grip = (index: number) => rows()[index].querySelector<HTMLButtonElement>('.grip') as HTMLButtonElement;
  const region = () => document.body.lastElementChild as HTMLElement;
  const live = () => region().textContent?.trim();
  const transforms = () => rows().map((row) => row.style.transform);
  const moves = () => fixture.componentInstance.moves;
  const key = (target: HTMLElement, name: string) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };
  const pointer = (target: HTMLElement, type: string, clientY: number) =>
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientY, pointerId: 1, isPrimary: true, button: 0 }));

  beforeEach(async () => {
    // jsdom nepočítá rozložení ani nezná zachycení ukazatele: řádky 50 px pod sebou (48 px + 2 px mezera)
    vi.spyOn(HTMLLIElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLLIElement) {
      const index = [...(this.parentElement?.children ?? [])].indexOf(this);
      return new DOMRect(0, 100 + index * 50, 300, 48);
    });
    Object.assign(HTMLElement.prototype, { setPointerCapture: vi.fn(), hasPointerCapture: () => false, scrollIntoView: vi.fn() });
    onTestFinished(() => {
      ['setPointerCapture', 'hasPointerCapture', 'scrollIntoView'].forEach((name) => Reflect.deleteProperty(HTMLElement.prototype, name));
    });
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    fixture = TestBed.createComponent(Host);
    root = fixture.nativeElement;
    document.body.prepend(root);
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    root.remove();
  });

  it('adds a polite live region at the end of the body and removes it on destroy', () => {
    const element = region();
    expect(element.getAttribute('aria-live')).toBe('polite');
    expect(element.className).toBe('visually-hidden');
    fixture.destroy();
    expect(element.isConnected).toBe(false);
  });

  describe('keyboard', () => {
    it('grabs with Space, moves with the arrows and drops with Enter', () => {
      grip(0).focus();
      expect(key(grip(0), ' ').defaultPrevented).toBe(true);
      expect(grip(0).getAttribute('aria-pressed')).toBe('true');
      expect(live()).toBe('Uchopeno: Domov, pozice 1 z 3. Šipky ho posunou, mezerník nebo Enter ho pustí, Esc přesun zruší.');

      key(grip(0), 'ArrowDown');
      expect(live()).toBe('Pozice 2 z 3');
      expect(transforms()).toEqual(['translateY(50px)', 'translateY(-50px)', '']);
      key(grip(0), 'ArrowDown');
      key(grip(0), 'ArrowDown');
      expect(transforms()).toEqual(['translateY(100px)', 'translateY(-50px)', 'translateY(-50px)']);

      key(grip(0), 'Enter');
      expect(moves()).toEqual([{ from: 0, to: 2 }]);
      expect(live()).toBe('Puštěno na pozici 3 z 3');
      expect(grip(0).getAttribute('aria-pressed')).toBe('false');
      expect(transforms()).toEqual(['', '', '']);
      expect(rows().some((row) => row.classList.contains('reorder-shift') || row.classList.contains('reorder-dragging'))).toBe(false);
      expect(document.activeElement).toBe(grip(0));
    });

    it('returns the original position on Esc without moving', () => {
      grip(2).focus();
      key(grip(2), 'Enter');
      key(grip(2), 'ArrowUp');
      expect(transforms()).toEqual(['', 'translateY(50px)', 'translateY(-50px)']);

      key(grip(2), 'Escape');
      expect(moves()).toEqual([]);
      expect(live()).toBe('Přesun zrušen');
      expect(transforms()).toEqual(['', '', '']);
      expect(grip(2).getAttribute('aria-pressed')).toBe('false');
    });

    it('stays at the edge and does not emit a drop on the same position', () => {
      grip(0).focus();
      key(grip(0), ' ');
      key(grip(0), 'ArrowUp');
      expect(live()).toBe('Pozice 1 z 3');
      // Stejná hláška podruhé se odliší, aby ji čtečka přečetla znovu
      key(grip(0), 'ArrowUp');
      expect(region().textContent).toBe('Pozice 1 z 3\u00a0');
      key(grip(0), ' ');
      expect(moves()).toEqual([]);
    });

    it('ignores a held key and shortcuts with a modifier', () => {
      grip(0).focus();
      grip(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(grip(0).getAttribute('aria-pressed')).toBe('false');
      key(grip(0), ' ');
      grip(0).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true }));
      expect(grip(0).getAttribute('aria-pressed')).toBe('true');
    });

    it('ignores the arrows before grabbing and cancels silently when the focus leaves', () => {
      grip(1).focus();
      expect(key(grip(1), 'ArrowDown').defaultPrevented).toBe(false);
      key(grip(1), ' ');
      key(grip(1), 'ArrowDown');
      root.querySelector<HTMLButtonElement>('.other')?.focus();

      expect(transforms()).toEqual(['', '', '']);
      expect(grip(1).getAttribute('aria-pressed')).toBe('false');
      expect(live()).toBe('Pozice 3 z 3');
      expect(moves()).toEqual([]);
    });
  });

  describe('pointer', () => {
    it('drags the row by the handle and emits the drop position', () => {
      pointer(grip(0), 'pointerdown', 120);
      expect(document.activeElement).toBe(grip(0));
      pointer(grip(0), 'pointermove', 175);
      expect(live()).toBe('Uchopeno: Domov');
      expect(transforms()).toEqual(['translateY(55px)', 'translateY(-50px)', '']);
      pointer(grip(0), 'pointermove', 230);
      expect(transforms()).toEqual(['translateY(110px)', 'translateY(-50px)', 'translateY(-50px)']);

      pointer(grip(0), 'pointerup', 230);
      expect(moves()).toEqual([{ from: 0, to: 2 }]);
      expect(live()).toBe('Puštěno na pozici 3 z 3');
      expect(transforms()).toEqual(['', '', '']);
    });

    it('treats a move under 4 px as a tap', () => {
      pointer(grip(1), 'pointerdown', 120);
      pointer(grip(1), 'pointermove', 123);
      pointer(grip(1), 'pointerup', 123);

      expect(moves()).toEqual([]);
      expect(live()).toBe('');
      expect(grip(1).getAttribute('aria-pressed')).toBe('false');
    });

    it('returns the original position when the pointer is cancelled', () => {
      pointer(grip(2), 'pointerdown', 220);
      pointer(grip(2), 'pointermove', 120);
      pointer(grip(2), 'pointercancel', 120);

      expect(moves()).toEqual([]);
      expect(live()).toBe('Přesun zrušen');
      expect(transforms()).toEqual(['', '', '']);
    });

    it('ends the drag when the pointer capture is lost, so the next grab works', () => {
      pointer(grip(0), 'pointerdown', 120);
      pointer(grip(0), 'pointermove', 175);
      pointer(grip(0), 'lostpointercapture', 175);

      expect(moves()).toEqual([]);
      expect(transforms()).toEqual(['', '', '']);
      grip(1).focus();
      key(grip(1), ' ');
      expect(grip(1).getAttribute('aria-pressed')).toBe('true');
    });

    it('starts only from the handle', () => {
      pointer(rows()[0], 'pointerdown', 120);
      pointer(rows()[0], 'pointermove', 220);
      pointer(rows()[0], 'pointerup', 220);

      expect(moves()).toEqual([]);
      expect(transforms()).toEqual(['', '', '']);
    });
  });
});
