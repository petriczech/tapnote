import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { AUTH_API_LOADER, AUTH_SESSION_KEY } from '../../core/firebase/auth.service';
import { FakeAuthApi } from '../../core/firebase/testing/fake-auth-api';
import { Sync } from './sync';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

describe('Sync', () => {
  let api: FakeAuthApi;
  let loads: number;
  let fixture: ComponentFixture<Sync>;
  let root: HTMLElement;

  const button = () => root.querySelector<HTMLButtonElement>('.card button') as HTMLButtonElement;
  const info = () => root.querySelector('.card .info')?.textContent?.replace(/\s+/g, ' ').trim();
  const status = () => root.querySelector('[aria-live="polite"]');

  async function render(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [Sync],
      providers: [provideRouter([]), { provide: AUTH_API_LOADER, useValue: () => (loads++, Promise.resolve(api)) }],
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
    loads = 0;
    // jsdom matchMedia nemá; prohlížeč, ne nainstalovaná PWA
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
  });

  afterEach(() => {
    localStorage.removeItem(AUTH_SESSION_KEY);
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
    vi.mocked(Capacitor.isNativePlatform).mockReturnValueOnce(true);
    await render();

    expect(root.querySelector('.card button')).toBeNull();
    expect(loads).toBe(0);
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
