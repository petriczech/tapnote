import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { BackupExport } from '../../core/backup/backup-export';
import { AUTH_API_LOADER, NATIVE_AUTH_LOADER } from '../../core/firebase/auth.service';
import { SYNC_REMOTE_LOADER, SyncService, SyncState } from '../../core/firebase/sync.service';
import { FakeAuthApi, FakeNativeAuthApi } from '../../core/firebase/testing/fake-auth-api';
import { FakeSyncRemote } from '../../core/firebase/testing/fake-sync-remote';
import { createNote } from '../../core/model/note';
import { createTask } from '../../core/model/task';
import { CategoriesRepository } from '../../core/storage/categories-repository';
import { NotesRepository } from '../../core/storage/notes-repository';
import { OutboxRepository } from '../../core/storage/outbox-repository';
import { TasksRepository } from '../../core/storage/tasks-repository';
import { InMemoryCategoriesRepository } from '../../core/storage/testing/in-memory-categories-repository';
import { InMemoryNotesRepository } from '../../core/storage/testing/in-memory-notes-repository';
import { InMemoryOutboxRepository } from '../../core/storage/testing/in-memory-outbox-repository';
import { InMemoryTasksRepository } from '../../core/storage/testing/in-memory-tasks-repository';
import { Sync } from './sync';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

describe('Sync', () => {
  let api: FakeAuthApi;
  let native: FakeNativeAuthApi;
  let remote: FakeSyncRemote;
  let loads: number;
  let fixture: ComponentFixture<Sync>;
  let root: HTMLElement;

  const button = () => root.querySelector<HTMLButtonElement>('.card button') as HTMLButtonElement;
  const info = () => root.querySelector('.card .info')?.textContent?.replace(/\s+/g, ' ').trim();
  const status = () => root.querySelector('[aria-live="polite"]');
  const byText = (text: string) =>
    [...root.querySelectorAll<HTMLButtonElement>('.card button')].find((item) => item.textContent?.trim() === text) as HTMLButtonElement;
  const texts = (selector: string) => [...root.querySelectorAll(selector)].map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

  // Přihlášení a doběhnutí první synchronizace s falešným Firestore
  async function signedIn(): Promise<SyncService> {
    await render();
    await click();
    const sync = TestBed.inject(SyncService);
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    await fixture.whenStable();
    return sync;
  }

  // `seed` naplní místní úložiště před vytvořením stránky
  async function render(seed?: () => Promise<void>): Promise<void> {
    TestBed.configureTestingModule({
      imports: [Sync],
      providers: [
        provideRouter([]),
        { provide: AUTH_API_LOADER, useValue: () => (loads++, Promise.resolve(api)) },
        { provide: NATIVE_AUTH_LOADER, useValue: () => Promise.resolve(native) },
        { provide: SYNC_REMOTE_LOADER, useValue: () => Promise.resolve(() => remote) },
        { provide: NotesRepository, useClass: InMemoryNotesRepository },
        { provide: TasksRepository, useClass: InMemoryTasksRepository },
        { provide: CategoriesRepository, useClass: InMemoryCategoriesRepository },
        { provide: OutboxRepository, useClass: InMemoryOutboxRepository },
      ],
    });
    await seed?.();
    fixture = TestBed.createComponent(Sync);
    root = fixture.nativeElement;
    document.body.append(root);
    await fixture.whenStable();
  }

  async function click(): Promise<void> {
    button().click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    api = new FakeAuthApi();
    native = new FakeNativeAuthApi();
    remote = new FakeSyncRemote();
    loads = 0;
    // jsdom matchMedia nemá; prohlížeč, ne nainstalovaná PWA
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    localStorage.clear();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    vi.unstubAllGlobals();
    root.remove();
  });

  it('shows the breadcrumb, the focused title and the signed-out text', async () => {
    await render();

    expect(root.querySelector('.crumbs')?.getAttribute('href')).toBe('/settings');
    const title = root.querySelector('h1');
    expect(title?.textContent?.trim()).toBe('Synchronizace');
    expect(document.activeElement).toBe(title);
    expect(info()).toBe(
      'Po přihlášení se poznámky, úkoly a kategorie synchronizují mezi zařízeními. Bez přihlášení vše zůstává jen v tomto zařízení.',
    );
    expect(button().textContent?.trim()).toBe('Přihlásit přes Google');
    expect(status()?.textContent?.trim()).toBe('');
  });

  describe('backup before the first merge', () => {
    const hint = () => root.querySelector('.backup');
    const withNote = () => TestBed.inject(NotesRepository).put(createNote('n1', '2026-10-27T10:00:00.000Z'));

    it('offers a backup above the sign-in button when this device never synced and has data', async () => {
      await render(withNote);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(hint()).not.toBeNull();
      });

      expect(hint()?.querySelector('.info')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Při prvním přihlášení se data v tomto zařízení sloučí s daty v cloudu. Před přihlášením se doporučuje stáhnout zálohu.',
      );
      expect(texts('.card button')).toEqual(['Stáhnout zálohu', 'Přihlásit přes Google']);
      expect(byText('Stáhnout zálohu').classList).toContain('outlined');
    });

    it('downloads the same backup as Settings and announces it', async () => {
      await render(withNote);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(hint()).not.toBeNull();
      });
      const download = vi.spyOn(TestBed.inject(BackupExport), 'download').mockResolvedValue(true);

      byText('Stáhnout zálohu').click();
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(status()?.textContent?.trim()).toBe('Záloha je připravená.');
      });

      expect(download).toHaveBeenCalledTimes(1);
      expect(status()?.classList).not.toContain('error');
      expect(api.calls).toEqual([]);
    });

    it('announces a failed backup as an error', async () => {
      await render(withNote);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(hint()).not.toBeNull();
      });
      vi.spyOn(TestBed.inject(BackupExport), 'download').mockRejectedValue(new Error('quota'));

      byText('Stáhnout zálohu').click();
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(status()?.textContent?.trim()).toBe('Zálohu se nepodařilo vytvořit.');
      });

      expect(status()?.classList).toContain('error');
    });

    it('counts a task or a category as local data too', async () => {
      await render(() => TestBed.inject(TasksRepository).put(createTask('t1', 'Nakoupit', '2026-10-27T10:00:00.000Z')));
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(hint()).not.toBeNull();
      });
    });

    it('offers no backup when this device has no data', async () => {
      await render();
      await fixture.whenStable();

      expect(hint()).toBeNull();
      expect(texts('.card button')).toEqual(['Přihlásit přes Google']);
    });

    it('keeps the page and sign-in working without the offer when local data cannot be read', async () => {
      await render(async () => {
        await withNote();
        vi.spyOn(TestBed.inject(TasksRepository), 'getAll').mockRejectedValue(new Error('blocked'));
      });
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(texts('.card button')).toEqual(['Přihlásit přes Google']);
      });
      await TestBed.inject(NotesRepository).getAll();
      await fixture.whenStable();

      expect(hint()).toBeNull();
      await click();
      expect(info()).toBe('Přihlášeno jako petr@example.com');
    });

    it('offers no backup when this device already synced', async () => {
      localStorage.setItem('tapnote.sync.other-uid', JSON.stringify({ initialized: true, cursors: {} }));
      await render(withNote);
      await fixture.whenStable();
      await TestBed.inject(NotesRepository).getAll();
      await fixture.whenStable();

      expect(hint()).toBeNull();
    });

    it('hides the offer while signed in and offers it again after sign-out removes the marker', async () => {
      await render(withNote);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(hint()).not.toBeNull();
      });

      byText('Přihlásit přes Google').click();
      const sync = TestBed.inject(SyncService);
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(sync.state()).toBe('idle');
      });
      expect(hint()).toBeNull();
      expect(Object.keys(localStorage).some((key) => key.startsWith('tapnote.sync.'))).toBe(true);

      byText('Odhlásit').click();
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(hint()).not.toBeNull();
      });
      expect(texts('.card button')).toEqual(['Stáhnout zálohu', 'Přihlásit přes Google']);
    });
  });

  it('signs in and out on the same button and announces the sign-out', async () => {
    await render();
    button().focus();

    await click();
    expect(info()).toBe('Přihlášeno jako petr@example.com');
    expect(button().textContent?.trim()).toBe('Odhlásit');
    expect(document.activeElement).toBe(button());

    await click();
    expect(api.calls).toEqual(['popup', 'signOut']);
    expect(button().textContent?.trim()).toBe('Přihlásit přes Google');
    expect(status()?.textContent?.trim()).toBe('Odhlášeno. Data v tomto zařízení zůstávají.');
    expect(status()?.classList).not.toContain('error');
  });

  it('signs in natively in the Android app, syncs and signs out of both', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    await render();
    expect(loads).toBe(1);

    await click();
    const sync = TestBed.inject(SyncService);
    await vi.waitFor(() => expect(sync.state()).toBe('idle'));
    await fixture.whenStable();
    expect(native.calls).toEqual(['signIn']);
    expect(api.calls).toEqual(['idToken:google-id-token']);
    expect(info()).toBe('Přihlášeno jako petr@example.com');
    expect(texts('.card .state')).toEqual(['Synchronizováno']);
    expect(texts('.card button')).toEqual(['Odhlásit', 'Synchronizovat teď', 'Smazat data v cloudu']);

    await click();
    expect(native.calls).toEqual(['signIn', 'signOut']);
    expect(api.calls).toEqual(['idToken:google-id-token', 'signOut']);
    expect(status()?.textContent?.trim()).toBe('Odhlášeno. Data v tomto zařízení zůstávají.');
  });

  it('announces a cancelled native sign-in in the Android app', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    native.failWith = new Error('activity is cancelled by the user.');
    await render();

    await click();

    expect(status()?.textContent?.trim()).toBe('Přihlášení se zrušilo.');
    expect(status()?.classList).toContain('error');
    expect(button().textContent?.trim()).toBe('Přihlásit přes Google');
  });

  it('announces that the signed-in account has no access to sync', async () => {
    remote.failWith = { code: 'permission-denied' };
    await render();

    await click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(status()?.textContent?.trim()).toBe('Tento účet nemá k synchronizaci přístup.');
    });
    expect(status()?.classList).toContain('error');
    expect(info()).toBe('Přihlášeno jako petr@example.com');
  });

  it.each([
    ['auth/popup-closed-by-user', 'Přihlášení se zrušilo.'],
    ['auth/popup-blocked', 'Prohlížeč zablokoval okno přihlášení. Povolte vyskakovací okna a zkuste to znovu.'],
    ['auth/network-request-failed', 'Přihlášení vyžaduje připojení k internetu.'],
    ['auth/internal-error', 'Přihlášení se nepovedlo. Zkuste to znovu.'],
  ])('shows the error for %s', async (code, message) => {
    api.failWith = { code };
    await render();

    await click();

    expect(status()?.textContent?.trim()).toBe(message);
    expect(status()?.classList).toContain('error');
    expect(button().textContent?.trim()).toBe('Přihlásit přes Google');
  });

  it.each<[SyncState, string]>([
    ['idle', 'Synchronizováno'],
    ['syncing', 'Synchronizuje se…'],
    ['offline', 'Offline. Změny se odešlou po připojení.'],
    ['error', 'Synchronizace selhala. Zkusí se to znovu.'],
  ])('shows the state %s outside the live region', async (state, text) => {
    const sync = await signedIn();

    sync.state.set(state);
    await fixture.whenStable();

    expect(texts('.card .state')).toEqual([text]);
    expect(root.querySelector('.card .state')?.closest('[aria-live]')).toBeNull();
    expect(root.querySelector('.card .state')?.classList.contains('error')).toBe(state === 'error');
  });

  it('shows rejected records, pending changes and the last sync only when there are any', async () => {
    const sync = await signedIn();
    const at = '2026-10-27T10:05:00.000Z';
    sync.lastSyncedAt.set(at);
    await fixture.whenStable();
    expect(texts('.card .info')).toEqual([
      'Přihlášeno jako petr@example.com',
      `Poslední synchronizace: ${new Date(at).toLocaleString('cs-CZ', { dateStyle: 'medium', timeStyle: 'short' })}`,
    ]);

    sync.state.set('error');
    sync.rejected.set(2);
    sync.pending.set(3);
    await fixture.whenStable();

    expect(texts('.card .state')).toEqual(['Synchronizace selhala. Zkusí se to znovu.', 'Server odmítl některé záznamy (2).']);
    expect(texts('.card .info').at(-1)).toBe('Čeká na odeslání: 3');

    sync.lastSyncedAt.set(null);
    await fixture.whenStable();
    expect(texts('.card .info').some((text) => text?.startsWith('Poslední synchronizace'))).toBe(false);
  });

  it('syncs now and marks the button disabled while syncing', async () => {
    const sync = await signedIn();
    const syncNow = vi.spyOn(sync, 'syncNow').mockImplementation(() => undefined);

    byText('Synchronizovat teď').click();
    expect(syncNow).toHaveBeenCalledTimes(1);

    sync.state.set('syncing');
    await fixture.whenStable();
    expect(byText('Synchronizovat teď').getAttribute('aria-disabled')).toBe('true');
    byText('Synchronizovat teď').click();
    expect(syncNow).toHaveBeenCalledTimes(1);
  });

  it('offers no sync buttons when the account has no access', async () => {
    remote.failWith = { code: 'permission-denied' };
    await render();
    await click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(status()?.textContent?.trim()).toBe('Tento účet nemá k synchronizaci přístup.');
    });

    expect(texts('.card button')).toEqual(['Odhlásit']);
    expect(root.querySelector('.card .state')).toBeNull();
  });

  it('offers no sync buttons while sync is off', async () => {
    const sync = await signedIn();

    sync.state.set('off');
    await fixture.whenStable();

    expect(texts('.card button')).toEqual(['Odhlásit']);
  });

  it('deletes the cloud data after confirmation, signs out and moves focus to the sign-in button', async () => {
    const sync = await signedIn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleteCloud = vi.spyOn(sync, 'deleteCloud');

    byText('Smazat data v cloudu').click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(status()?.textContent?.trim()).toBe('Data v cloudu jsou smazaná.');
    });

    expect(confirm).toHaveBeenCalledWith(
      'Smazat data v cloudu? Smažou se poznámky, úkoly a kategorie uložené v cloudu. Data v tomto zařízení zůstanou a účet se odhlásí.',
    );
    expect(deleteCloud).toHaveBeenCalledTimes(1);
    expect(api.calls).toEqual(['popup', 'signOut']);
    expect(status()?.classList).not.toContain('error');
    expect(button().textContent?.trim()).toBe('Přihlásit přes Google');
    expect(document.activeElement).toBe(button());
    expect(root.querySelector('.card .state')).toBeNull();
  });

  it('keeps everything when the cloud delete is not confirmed', async () => {
    const sync = await signedIn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const deleteAll = vi.spyOn(remote, 'deleteAll');

    byText('Smazat data v cloudu').click();
    await fixture.whenStable();

    expect(deleteAll).not.toHaveBeenCalled();
    expect(sync.state()).toBe('idle');
    expect(info()).toBe('Přihlášeno jako petr@example.com');
    expect(status()?.textContent?.trim()).toBe('');
  });

  it('announces the generic sync error when the cloud delete fails and stays signed in', async () => {
    await signedIn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    remote.failDeleteWith = { code: 'unavailable' };

    byText('Smazat data v cloudu').click();
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(status()?.textContent?.trim()).toBe('Synchronizace selhala. Zkusí se to znovu.');
    });

    expect(status()?.classList).toContain('error');
    expect(api.calls).toEqual(['popup']);
    expect(info()).toBe('Přihlášeno jako petr@example.com');
  });
});
