import { TestBed } from '@angular/core/testing';
import { Capacitor } from '@capacitor/core';
import { AUTH_API_LOADER, AUTH_SESSION_KEY, authErrorOf, AuthService, isStandalone, NATIVE_AUTH_LOADER } from './auth.service';
import { FakeAuthApi, FakeNativeAuthApi } from './testing/fake-auth-api';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(() => false) } }));

describe('AuthService', () => {
  let api: FakeAuthApi;
  let native: FakeNativeAuthApi;
  let loader: ReturnType<typeof vi.fn>;
  let nativeLoader: ReturnType<typeof vi.fn>;

  function create(initial: FakeAuthApi = new FakeAuthApi()): AuthService {
    api = initial;
    native = new FakeNativeAuthApi();
    loader = vi.fn(() => Promise.resolve(api));
    nativeLoader = vi.fn(() => Promise.resolve(native));
    TestBed.configureTestingModule({
      providers: [
        { provide: AUTH_API_LOADER, useValue: loader },
        { provide: NATIVE_AUTH_LOADER, useValue: nativeLoader },
      ],
    });
    return TestBed.inject(AuthService);
  }

  // jsdom matchMedia nemá; výchozí je prohlížeč, ne nainstalovaná PWA
  beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false })));

  afterEach(() => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
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
    // Na webu se nativní plugin nenačítá
    expect(nativeLoader).not.toHaveBeenCalled();
  });

  describe('in the Android app', () => {
    beforeEach(() => vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true));

    it('signs in to the web SDK with the idToken from the native plugin and signs out of both', async () => {
      const auth = create();

      expect(await auth.signIn()).toBeNull();
      expect(native.calls).toEqual(['signIn']);
      expect(api.calls).toEqual(['idToken:google-id-token']);
      expect(auth.state()).toBe('signedIn');
      expect(localStorage.getItem(AUTH_SESSION_KEY)).not.toBeNull();

      await auth.signOut();
      expect(api.calls).toEqual(['idToken:google-id-token', 'signOut']);
      expect(native.calls).toEqual(['signIn', 'signOut']);
      expect(auth.state()).toBe('signedOut');
      expect(localStorage.getItem(AUTH_SESSION_KEY)).toBeNull();
    });

    it.each([['activity is cancelled by the user.'], ['Authorization canceled.']])(
      'reports a cancelled native sign-in (%s) and stays signed out',
      async (message) => {
        const auth = create();
        native.failWith = new Error(message);

        expect(await auth.signIn()).toBe('cancelled');
        expect(api.calls).toEqual([]);
        expect(auth.state()).toBe('signedOut');
      },
    );

    it('reports a failed native sign-in as offline without a connection and as failed otherwise', async () => {
      const auth = create();
      native.failWith = new Error('No credentials available');

      expect(await auth.signIn()).toBe('failed');
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      expect(await auth.signIn()).toBe('offline');
    });

    it('does not ask for a redirect result', async () => {
      const fake = new FakeAuthApi();
      fake.redirectError = { code: 'auth/argument-error' };
      const auth = create(fake);

      await auth.start();
      await Promise.resolve();

      expect(auth.redirectError()).toBeNull();
    });
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
