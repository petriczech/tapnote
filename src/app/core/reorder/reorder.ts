import { DestroyRef, Directive, ElementRef, inject, input, output } from '@angular/core';

export interface ReorderMove {
  from: number;
  to: number;
}

interface Drag {
  handle: HTMLElement;
  rows: HTMLElement[];
  from: number;
  to: number;
  // Výška řádku i s mezerou: o tolik se odsunou sousedé
  slot: number;
  rects: DOMRect[];
  keyboard: boolean;
  // Jen ukazatel: start tahu, poslední poloha a kontejner pro automatický scroll
  pointer?: number;
  startY?: number;
  y?: number;
  started?: boolean;
  scroller?: Element;
  startScroll?: number;
  frame?: number;
}

// Řazení svislého seznamu za úchyt .grip (Pointer Events a klávesnice, vzor „grab“ z .tmp/dnd/analyza.md).
// Hostitel je seznam, řádky jsou jeho přímí potomci. Během tahu se řádky jen posouvají (transform),
// pořadí dat mění až konzument po události moved a po přerenderování sám vrací fokus na úchyt.
@Directive({
  selector: '[tnReorder]',
  host: {
    '(pointerdown)': 'pointerDown($event)',
    '(keydown)': 'keyDown($event)',
    '(focusout)': 'focusOut($event)',
  },
})
export class Reorder {
  // Názvy položek v pořadí řádků pro oznámení čtečce
  readonly names = input.required<readonly string[]>({ alias: 'tnReorder' });
  readonly moved = output<ReorderMove>();

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly live = document.createElement('p');
  private drag?: Drag;

  constructor() {
    // Oznámení jdou do vlastního live regionu na konci body (jako LiveAnnouncer v CDK); do <ul> nepatří
    // a vedle seznamu by se pletl s live regiony stránky
    this.live.className = 'visually-hidden';
    this.live.setAttribute('aria-live', 'polite');
    document.body.append(this.live);
    inject(DestroyRef).onDestroy(() => {
      this.end(false, true);
      this.live.remove();
    });
  }

  protected pointerDown(event: PointerEvent): void {
    const handle = this.handleOf(event.target);
    if (this.drag?.keyboard) {
      // Klepnutí během klávesového uchopení ho tiše zruší, tah pak začne od původního pořadí
      this.end(false, true);
    }
    if (!handle || this.drag || !event.isPrimary || event.button !== 0) {
      return;
    }
    const drag = this.grab(handle, false);
    if (!drag) {
      return;
    }
    handle.focus({ preventScroll: true });
    handle.setPointerCapture(event.pointerId);
    const scroller = this.scrollerOf();
    Object.assign(drag, { pointer: event.pointerId, startY: event.clientY, y: event.clientY, scroller, startScroll: scroller.scrollTop });
    const move = (e: PointerEvent) => {
      if (e.pointerId === drag.pointer) {
        drag.y = e.clientY;
        this.follow();
      }
    };
    const stop = (e: PointerEvent) => {
      if (e.pointerId !== drag.pointer) {
        return;
      }
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      handle.removeEventListener('lostpointercapture', stop);
      // Přerušený tah (systémové gesto, ztráta zachycení po přesunu řádku v DOM) vrací původní pozici
      this.end(e.type === 'pointerup' && !!drag.started);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    handle.addEventListener('lostpointercapture', stop);
  }

  protected keyDown(event: KeyboardEvent): void {
    const handle = this.handleOf(event.target);
    const drag = this.drag;
    if (!handle || (drag && !drag.keyboard)) {
      return;
    }
    const key = event.key;
    if (key === ' ' || key === 'Enter') {
      // Držená klávesa ani zkratky s modifikátorem řádek neuchopí a nepustí
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (drag) {
        this.end(true);
      } else {
        const grabbed = this.grab(handle, true);
        if (grabbed) {
          this.say(`Uchopeno: ${this.name(grabbed.from)}, pozice ${grabbed.from + 1} z ${grabbed.rows.length}. Šipky ho posunou, mezerník nebo Enter ho pustí, Esc přesun zruší.`);
        }
      }
    } else if (drag && (key === 'ArrowUp' || key === 'ArrowDown')) {
      const to = Math.min(drag.rows.length - 1, Math.max(0, drag.to + (key === 'ArrowUp' ? -1 : 1)));
      const rect = drag.rects;
      this.place(to, to > drag.from ? rect[to].bottom - rect[drag.from].bottom : rect[to].top - rect[drag.from].top);
      handle.scrollIntoView({ block: 'nearest' });
      this.say(`Pozice ${to + 1} z ${drag.rows.length}`);
    } else if (drag && key === 'Escape') {
      this.end(false);
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  // Odchod fokusu z uchopeného úchytu (Tab, klepnutí jinam) přesun tiše zruší
  protected focusOut(event: FocusEvent): void {
    if (this.drag?.keyboard && event.relatedTarget !== this.drag.handle) {
      this.end(false, true);
    }
  }

  private grab(handle: HTMLElement, keyboard: boolean): Drag | undefined {
    const rows = [...this.host.children] as HTMLElement[];
    const from = rows.findIndex((row) => row.contains(handle));
    if (from < 0) {
      return undefined;
    }
    const rects = rows.map((row) => row.getBoundingClientRect());
    const slot =
      rows.length < 2
        ? rects[from].height
        : from < rows.length - 1
          ? rects[from + 1].top - rects[from].top
          : rects[from].bottom - rects[from - 1].bottom;
    this.drag = { handle, rows, from, to: from, slot, rects, keyboard };
    handle.setAttribute('aria-pressed', 'true');
    rows[from].classList.add('reorder-dragging');
    // Při tahu ukazatelem řádek sleduje prst bez zpoždění, odsouvají se jen sousedé
    rows.forEach((row, index) => row.classList.toggle('reorder-shift', keyboard || index !== from));
    return this.drag;
  }

  // Posun taženého řádku o dy a odsunutí sousedů podle cílové pozice
  private place(to: number, dy: number): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    drag.to = to;
    drag.rows.forEach((row, index) => {
      const shift =
        index === drag.from ? dy : index >= to && index < drag.from ? drag.slot : index <= to && index > drag.from ? -drag.slot : 0;
      row.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  // Tah ukazatelem: posun o pohyb prstu a o odscrollování, cíl podle středu taženého řádku
  private follow(): void {
    const drag = this.drag;
    if (!drag?.scroller || drag.y === undefined || drag.startY === undefined) {
      return;
    }
    if (!drag.started) {
      // Pod 4 px jde o klepnutí, ne o tah
      if (Math.abs(drag.y - drag.startY) < 4) {
        return;
      }
      drag.started = true;
      this.say(`Uchopeno: ${this.name(drag.from)}`);
      drag.frame = requestAnimationFrame(() => this.autoscroll());
    }
    const dy = drag.y - drag.startY + drag.scroller.scrollTop - (drag.startScroll ?? 0);
    const mid = (rect: DOMRect) => (rect.top + rect.bottom) / 2;
    const center = mid(drag.rects[drag.from]) + dy;
    let to = drag.from;
    drag.rects.forEach((rect, index) => {
      if ((index < drag.from && center < mid(rect)) || (index > drag.from && center > mid(rect))) {
        to += index < drag.from ? -1 : 1;
      }
    });
    this.place(to, dy);
  }

  // U horního a dolního okraje scroll kontejneru se posouvá rychlostí podle hloubky v okraji (mimo pevné lišty ze scroll-padding)
  private autoscroll(): void {
    const drag = this.drag;
    if (!drag?.scroller || drag.y === undefined) {
      return;
    }
    const scroller = drag.scroller;
    const page = scroller === document.scrollingElement;
    const style = getComputedStyle(scroller);
    const box = page ? { top: 0, bottom: innerHeight } : scroller.getBoundingClientRect();
    const top = box.top + (parseFloat(style.scrollPaddingTop) || 0);
    const bottom = box.bottom - (parseFloat(style.scrollPaddingBottom) || 0);
    const edge = 56;
    const depth = drag.y < top + edge ? drag.y - top - edge : drag.y > bottom - edge ? drag.y - bottom + edge : 0;
    const step = Math.max(-16, Math.min(16, Math.round(depth / 4)));
    if (step) {
      const before = scroller.scrollTop;
      scroller.scrollBy({ top: step, behavior: 'instant' });
      if (scroller.scrollTop !== before) {
        this.follow();
      }
    }
    drag.frame = requestAnimationFrame(() => this.autoscroll());
  }

  // Puštění (commit) vyšle moved, jinak se vrátí původní pozice; fokus zůstává na úchytu
  private end(commit: boolean, silent = false): void {
    const drag = this.drag;
    if (!drag) {
      return;
    }
    this.drag = undefined;
    if (drag.frame !== undefined) {
      cancelAnimationFrame(drag.frame);
    }
    if (drag.pointer !== undefined && drag.handle.hasPointerCapture(drag.pointer)) {
      drag.handle.releasePointerCapture(drag.pointer);
    }
    drag.handle.setAttribute('aria-pressed', 'false');
    // Nejdřív bez přechodu, aby řádky po přeřazení dat neodjely zpět animací
    drag.rows.forEach((row) => {
      row.classList.remove('reorder-shift', 'reorder-dragging');
      row.style.transform = '';
    });
    const started = drag.keyboard || drag.started;
    if (commit && started) {
      this.say(`Puštěno na pozici ${drag.to + 1} z ${drag.rows.length}`);
      if (drag.to !== drag.from) {
        this.moved.emit({ from: drag.from, to: drag.to });
      }
    } else if (started && !silent) {
      this.say('Přesun zrušen');
    }
  }

  private handleOf(target: EventTarget | null): HTMLElement | null {
    const handle = target instanceof Element ? target.closest<HTMLElement>('.grip') : null;
    return handle && this.host.contains(handle) ? handle : null;
  }

  private scrollerOf(): Element {
    for (let node = this.host.parentElement; node && node !== document.body; node = node.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) {
        return node;
      }
    }
    return document.scrollingElement ?? document.documentElement;
  }

  private name(index: number): string {
    return this.names()[index] ?? '';
  }

  // Stejný text dvakrát po sobě by čtečka nepřečetla, proto se odliší nezlomitelnou mezerou
  private say(text: string): void {
    this.live.textContent = this.live.textContent === text ? `${text}\u00a0` : text;
  }
}
