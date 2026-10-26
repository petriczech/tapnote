import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App, URLOpenListenerEvent } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { MockInstance } from 'vitest';
import { listenForAppUrls, NEW_NOTE_URL, NEW_TASK_URL } from './app-urls';

vi.mock('@capacitor/app', () => ({ App: { addListener: vi.fn(), getLaunchUrl: vi.fn() } }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn() } }));

describe('listenForAppUrls', () => {
  let listener: (event: URLOpenListenerEvent) => void;
  let navigate: MockInstance<Router['navigateByUrl']>;
  let replaceState: MockInstance<Location['replaceState']>;

  function run(launchUrl?: string): Promise<void> {
    vi.mocked(App.getLaunchUrl).mockResolvedValue(launchUrl ? { url: launchUrl } : undefined);
    return TestBed.runInInjectionContext(() => listenForAppUrls());
  }

  beforeEach(() => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(App.addListener).mockImplementation((_event, callback) => {
      listener = callback as unknown as (event: URLOpenListenerEvent) => void;
      return Promise.resolve({ remove: () => Promise.resolve() });
    });
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    replaceState = vi.spyOn(TestBed.inject(Location), 'replaceState');
  });

  afterEach(() => vi.clearAllMocks());

  it('does nothing in the browser', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    await run(NEW_NOTE_URL);

    expect(App.addListener).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('starts on a new note when launched from the shortcut', async () => {
    await run(NEW_NOTE_URL);

    expect(replaceState).toHaveBeenCalledWith('/new');
  });

  it('starts on a new task when launched from the shortcut', async () => {
    await run(NEW_TASK_URL);

    expect(replaceState).toHaveBeenCalledWith('/tasks', 'new=1');
  });

  it('starts on a task detail when launched from the widget', async () => {
    await run('tapnote://task/abc');

    expect(replaceState).toHaveBeenCalledWith('/task/abc');
  });

  it('opens a task detail from the widget while running', async () => {
    await run();

    listener({ url: 'tapnote://task/abc' });
    expect(navigate).toHaveBeenCalledWith('/task/abc');

    listener({ url: 'tapnote://tasks' });
    expect(navigate).toHaveBeenCalledWith('/tasks');
  });

  it('keeps a task link inside the task detail', async () => {
    await run('tapnote://task/../settings');

    expect(replaceState).toHaveBeenCalledWith('/task/..%2Fsettings');

    listener({ url: 'tapnote://task/..%2Fsettings' });
    expect(navigate).toHaveBeenCalledWith('/task/..%252Fsettings');
  });

  it('keeps the start page for a normal launch', async () => {
    await run();

    expect(replaceState).not.toHaveBeenCalled();
  });

  it('opens a new note from the shortcut while running', async () => {
    await run();

    listener({ url: NEW_NOTE_URL });
    expect(navigate).toHaveBeenCalledWith('/new');

    listener({ url: NEW_TASK_URL });
    expect(navigate).toHaveBeenCalledWith('/tasks?new=1');

    listener({ url: 'tapnote://settings' });
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
