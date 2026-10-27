import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AUTH_API_LOADER } from '../../core/firebase/auth.service';
import { SYNC_REMOTE_LOADER, SyncService, SyncState } from '../../core/firebase/sync.service';
import { FakeAuthApi } from '../../core/firebase/testing/fake-auth-api';
import { FakeSyncRemote } from '../../core/firebase/testing/fake-sync-remote';
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

  async function render(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [Sync],
      providers: [
        provideRouter([]),
        { provide: AUTH_API_LOADER, useValue: () => (loads++, Promise.resolve(api)) },
        { provide: SYNC_REMOTE_LOADER, useValue: () => Promise.resolve(() => remote) },
        { provide: NotesRepository, useClass: InMemoryNotesRepository },
        { provide: TasksRepository, useClass: InMemoryTasksRepository },
        { provide: CategoriesRepository, useClass: InMemoryCategoriesRepository },
        { provide: OutboxRepository, useClass: InMemoryOutboxRepository },
      ],
    });
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

  it('offers no sign-in and does not load Firebase in the Android app until native sign-in (S4)', async () => {
    // Ptá se stránka i SyncService
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    await render();

    expect(root.querySelector('.card button')).toBeNull();
    expect(loads).toBe(0);
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
