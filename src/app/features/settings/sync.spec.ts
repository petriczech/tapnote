import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AUTH_API_LOADER } from '../../core/firebase/auth.service';
import { SYNC_REMOTE_LOADER } from '../../core/firebase/sync.service';
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
});
