import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Undo, UNDO_MS } from './undo';
import { UndoBar } from './undo-bar';

describe('UndoBar', () => {
  let fixture: ComponentFixture<UndoBar>;
  let root: HTMLElement;
  let undo: Undo;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'notes', children: [] }])] });
    fixture = TestBed.createComponent(UndoBar);
    root = fixture.nativeElement;
    undo = TestBed.inject(Undo);
    document.body.append(root);
    onTestFinished(() => root.remove());
    await fixture.whenStable();
  });

  it('keeps an empty polite status region in the page', () => {
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-live')).toBe('polite');
    expect(root.textContent?.trim()).toBe('');
  });

  it('shows the text with Zpět and runs the undo on click', async () => {
    const action = vi.fn(async () => undefined);
    undo.show('Úkol je hotový.', 'a', action);
    await fixture.whenStable();

    expect(root.querySelector('span')?.textContent).toBe('Úkol je hotový.');
    root.querySelector('button')?.click();
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await fixture.whenStable();

    expect(root.querySelector('.bar')).toBeNull();
  });

  it('shows a failed undo as text without Zpět', async () => {
    undo.show('Úkol je hotový.', 'a', () => Promise.reject(new Error('update failed')));
    await fixture.whenStable();

    root.querySelector('button')?.click();
    await vi.waitFor(() => expect(undo.message()?.text).toBe('Změnu se nepodařilo uložit.'));
    await fixture.whenStable();

    expect(root.querySelector('span')?.textContent).toBe('Změnu se nepodařilo uložit.');
    expect(root.querySelector('button')).toBeNull();
  });

  it('stays while the focus or the mouse is inside and hides after both leave', async () => {
    undo.show('Úkol je smazaný.', 'a', async () => undefined);
    await fixture.whenStable();
    const button = root.querySelector('button') as HTMLButtonElement;

    button.focus();
    vi.advanceTimersByTime(UNDO_MS * 2);
    await fixture.whenStable();
    expect(root.querySelector('.bar')).not.toBeNull();

    button.blur();
    root.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(UNDO_MS * 2);
    await fixture.whenStable();
    expect(root.querySelector('.bar')).not.toBeNull();

    root.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    vi.advanceTimersByTime(UNDO_MS);
    await fixture.whenStable();
    expect(root.querySelector('.bar')).toBeNull();
  });

  it('does not stay for a touch on the bar', async () => {
    undo.show('Úkol je hotový.', 'a', async () => undefined);
    await fixture.whenStable();

    root.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    vi.advanceTimersByTime(UNDO_MS);
    await fixture.whenStable();

    expect(root.querySelector('.bar')).toBeNull();
  });

  it('hides on navigation', async () => {
    undo.show('Úkol je hotový.', 'a', async () => undefined);
    await fixture.whenStable();

    await TestBed.inject(Router).navigateByUrl('/notes');

    expect(undo.message()).toBeUndefined();
  });
});
