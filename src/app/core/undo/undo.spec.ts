import { TestBed } from '@angular/core/testing';
import { Undo, UNDO_MS } from './undo';

describe('Undo', () => {
  let undo: Undo;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    undo = TestBed.inject(Undo);
  });

  it('hides the message after five seconds', () => {
    undo.show('Úkol je hotový.', 'a', async () => undefined);
    expect(undo.message()?.text).toBe('Úkol je hotový.');

    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(undo.message()).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(undo.message()).toBeUndefined();
  });

  it('replaces the previous message and restarts the time', () => {
    const first = vi.fn(async () => undefined);
    undo.show('Úkol je hotový.', 'a', first);
    vi.advanceTimersByTime(UNDO_MS - 1000);

    undo.show('Úkol je smazaný.', 'b', async () => undefined);
    vi.advanceTimersByTime(UNDO_MS - 1);

    expect(undo.message()?.text).toBe('Úkol je smazaný.');
    expect(first).not.toHaveBeenCalled();
  });

  it('keeps the message while held and hides it five seconds after release', () => {
    undo.show('Úkol je hotový.', 'a', async () => undefined);
    undo.hold();
    vi.advanceTimersByTime(UNDO_MS * 3);
    expect(undo.message()).toBeDefined();

    undo.release();
    vi.advanceTimersByTime(UNDO_MS);
    expect(undo.message()).toBeUndefined();
  });

  it('runs the undo once, hides the message and reports the task', async () => {
    const action = vi.fn(async () => undefined);
    const undone: string[] = [];
    undo.undone.subscribe((id) => undone.push(id));
    undo.show('Úkol je hotový.', 'a', action);

    await undo.undo();
    await undo.undo();

    expect(action).toHaveBeenCalledTimes(1);
    expect(undo.message()).toBeUndefined();
    expect(undone).toEqual(['a']);
  });

  it('shows the error without Zpět when the undo fails and reports no task', async () => {
    const undone: string[] = [];
    undo.undone.subscribe((id) => undone.push(id));
    undo.show('Úkol je hotový.', 'a', () => Promise.reject(new Error('update failed')));

    await undo.undo();

    expect(undo.message()).toEqual({ text: 'Změnu se nepodařilo uložit.' });
    expect(undone).toEqual([]);
    vi.advanceTimersByTime(UNDO_MS);
    expect(undo.message()).toBeUndefined();
  });

  it('runs the undo once while it is saving and keeps a message that came meanwhile', async () => {
    let finish!: () => void;
    const action = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    undo.show('Úkol je hotový.', 'a', action);

    const first = undo.undo();
    expect(undo.message()).toEqual({ text: 'Úkol je hotový.' });
    await undo.undo();
    undo.show('Úkol je hotový.', 'b', async () => undefined);
    finish();
    await first;

    expect(action).toHaveBeenCalledTimes(1);
    expect(undo.message()?.undo?.id).toBe('b');
  });

  it('hides the message at once', () => {
    undo.show('Úkol je hotový.', 'a', async () => undefined);
    undo.hide();
    expect(undo.message()).toBeUndefined();
  });
});
