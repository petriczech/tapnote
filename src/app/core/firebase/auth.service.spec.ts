import { TestBed } from '@angular/core/testing';
import { AUTH_API_LOADER, AUTH_SESSION_KEY, authErrorOf, AuthService, isStandalone } from './auth.service';
import { FakeAuthApi } from './testing/fake-auth-api';

describe('AuthService', () => {
  let api: FakeAuthApi;
  let loader: ReturnType<typeof vi.fn>;

  function create(initial: FakeAuthApi = new FakeAuthApi()): AuthService {
    api = initial;
    loader = vi.fn(() => Promise.resolve(api));
    TestBed.configureTestingModule({ providers: [{ provide: AUTH_API_LOADER, useValue: loader }] });
    return TestBed.inject(AuthService);
  }

  // jsdom matchMedia nemá; výchozí je prohlížeč, ne nainstalovaná PWA
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })));

  afterEach(() => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not load Firebase without a previous session', () => {
    const auth = create();

    expect(loader).not.toHaveBeenCalled();
    expect(auth.state()).toBe('off');
  });

  it('loads Firebase right away when a previous session exists and restores the user', async () => {
    localStorage.setItem(AUTH_SESSION_KEY, '1');
    const auth = create(new FakeAuthApi({ uid: 'uid-1', email: 'petr@example.com' }));

    expect(auth.state()).toBe('loading');
    await auth.start();

    expect(loader).toHaveBeenCalledTimes(1);
    expect(auth.state()).toBe('signedIn');
    expect(auth.email()).toBe('petr@example.com');
  });

  it('signs in with a popup, stores the session flag and removes it on sign-out', async () => {
    const auth = create();

    expect(await auth.signIn()).toBeNull();
    expect(api.calls).toEqual(['popup']);
    expect(auth.state()).toBe('signedIn');
    expect(localStorage.getItem(AUTH_SESSION_KEY)).not.toBeNull();

    await auth.signOut();
    expect(auth.state()).toBe('signedOut');
    expect(auth.user()).toBeNull();
    expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('uses a popup in the installed PWA too (redirect fails across sites on GitHub Pages)', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const auth = create();

    expect(isStandalone()).toBe(true);
    await auth.signIn();

    expect(api.calls).toEqual(['popup']);
  });

  it('maps a failed redirect return to an error', async () => {
    const fake = new FakeAuthApi();
    fake.redirectError = { code: 'auth/network-request-failed' };
    const auth = create(fake);

    await auth.start();
    await Promise.resolve();

    expect(auth.redirectError()).toBe('offline');
  });

  it('retries loading Firebase after the chunk failed to load', async () => {
    const auth = create();
    loader.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module'));

    expect(await auth.signIn()).toBe('failed');
    expect(auth.state()).toBe('off');
    expect(await auth.signIn()).toBeNull();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('maps Firebase error codes to messages', () => {
    expect(authErrorOf({ code: 'auth/popup-closed-by-user' })).toBe('cancelled');
    expect(authErrorOf({ code: 'auth/cancelled-popup-request' })).toBe('cancelled');
    expect(authErrorOf({ code: 'auth/popup-blocked' })).toBe('blocked');
    expect(authErrorOf({ code: 'auth/network-request-failed' })).toBe('offline');
    expect(authErrorOf({ code: 'auth/internal-error' })).toBe('failed');
    expect(authErrorOf(new Error('x'))).toBe('failed');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(authErrorOf(new Error('Failed to fetch'))).toBe('offline');
  });
});
