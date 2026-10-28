import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App, BackButtonListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { MockInstance } from 'vitest';
import { listenForBackButton } from './back-button';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), minimizeApp: vi.fn() } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));

describe('listenForBackButton', () => {
  let listener: (event: BackButtonListenerEvent) => void;
  let navigate: MockInstance<Router['navigateByUrl']>;
  let back: MockInstance<History['back']>;

  function press(url: string, canGoBack = false): void {
    vi.spyOn(TestBed.inject(Router), 'url', 'get').mockReturnValue(url);
    listener({ canGoBack });
  }

  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(App.addListener).mockImplementation((_event, callback) => {
      listener = callback as unknown as (event: BackButtonListenerEvent) => void;
      return Promise.resolve({ remove: () => Promise.resolve() });
    });
    vi.mocked(App.minimizeApp).mockResolvedValue();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    back = vi.spyOn(history, 'back').mockImplementation(() => undefined);
    TestBed.runInInjectionContext(() => listenForBackButton());
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('does nothing in the browser', () => {
    vi.mocked(App.addListener).mockClear();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    TestBed.runInInjectionContext(() => listenForBackButton());

    expect(App.addListener).not.toHaveBeenCalled();
  });

  it('closes an open menu first', () => {
    // jsdom popovery nepodporuje ani neotevírá, podpora i otevřená nabídka se proto podstrčí
    Object.defineProperty(HTMLElement.prototype, 'popover', { configurable: true, value: null });
    const menu = Object.assign(document.createElement('div'), { hidePopover: vi.fn() });
    const query = document.querySelectorAll.bind(document);
    vi.spyOn(document, 'querySelectorAll').mockImplementation((selector: string) =>
      selector === ':popover-open' ? ([menu] as unknown as NodeListOf<HTMLElement>) : query(selector),
    );

    try {
      press('/task/abc', true);
    } finally {
      delete (HTMLElement.prototype as { popover?: unknown }).popover;
    }

    expect(menu.hidePopover).toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('closes an open dialog like Esc', () => {
    // jsdom <dialog> neumí, otevřený dialog se proto podstrčí přes atribut open
    const dialog = Object.assign(document.createElement('dialog'), { close: vi.fn() });
    dialog.setAttribute('open', '');
    document.body.append(dialog);

    press('/settings/kategorie', true);

    expect(dialog.close).toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes back in history when there is one', () => {
    press('/task/abc', true);

    expect(back).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('goes to the parent list after a cold start on a detail', () => {
    press('/task/abc');
    expect(navigate).toHaveBeenLastCalledWith('/tasks', { replaceUrl: true });

    press('/note/abc/history');
    expect(navigate).toHaveBeenLastCalledWith('/notes', { replaceUrl: true });

    press('/new?template=x');
    expect(navigate).toHaveBeenLastCalledWith('/notes', { replaceUrl: true });

    press('/settings/kategorie');
    expect(navigate).toHaveBeenLastCalledWith('/settings', { replaceUrl: true });

    press('/notes');
    expect(navigate).toHaveBeenLastCalledWith('/tasks', { replaceUrl: true });

    expect(App.minimizeApp).not.toHaveBeenCalled();
  });

  it('hides the app from the task list', () => {
    press('/tasks?new=1');

    expect(App.minimizeApp).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});
