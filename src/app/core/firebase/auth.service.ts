import { computed, inject, InjectionToken, Service, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { AuthApi, AuthUser } from './firebase-auth';
import type { NativeAuthApi } from './native-auth';

/** Příznak předchozího přihlášení: jen s ním se Firebase načte hned (ne až na stránce Synchronizace). */
export const AUTH_SESSION_KEY = 'tapnote.auth';

/** Firebase Auth se načítá líně jako samostatný chunk; token kvůli unit testům bez sítě. */
export const AUTH_API_LOADER = new InjectionToken<() => Promise<AuthApi>>('AUTH_API_LOADER', {
  providedIn: 'root',
  factory: () => () => import('./firebase-auth').then((module) => module.createAuthApi()),
});

/** Nativní přihlášení přes Google (Android) se načítá líně, mimo úvodní balík webu; token kvůli unit testům. */
export const NATIVE_AUTH_LOADER = new InjectionToken<() => Promise<NativeAuthApi>>('NATIVE_AUTH_LOADER', {
  providedIn: 'root',
  factory: () => () => import('./native-auth').then((module) => module.createNativeAuthApi()),
});

export type AuthState = 'off' | 'loading' | 'signedOut' | 'signedIn';
export type AuthError = 'cancelled' | 'blocked' | 'offline' | 'failed';

const CANCELLED_CODES = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'];

export function authErrorOf(error: unknown): AuthError {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  // Nativní plugin zrušení hlásí jen textem bez kódu (Credential Manager, „Authorization canceled.“)
  const message = error instanceof Error ? error.message : '';
  if (CANCELLED_CODES.includes(code) || /cancel/i.test(message)) {
    return 'cancelled';
  }
  if (code === 'auth/popup-blocked') {
    return 'blocked';
  }
  if (code === 'auth/network-request-failed' || !navigator.onLine) {
    return 'offline';
  }
  return 'failed';
}

// Nainstalovaná PWA (display-mode standalone, iOS navigator.standalone); zatím se nevolá, viz signIn()
export function isStandalone(): boolean {
  const nav: Navigator & { standalone?: unknown } = navigator;
  return nav.standalone === true || matchMedia('(display-mode: standalone)').matches;
}

export function hasSession(): boolean {
  try {
    return localStorage.getItem(AUTH_SESSION_KEY) !== null;
  } catch {
    return false;
  }
}

function writeSession(signedIn: boolean): void {
  try {
    if (signedIn) {
      localStorage.setItem(AUTH_SESSION_KEY, '1');
    } else {
      localStorage.removeItem(AUTH_SESSION_KEY);
    }
  } catch {
    // Bez úložiště se Firebase načte až na stránce Synchronizace
  }
}

@Service()
export class AuthService {
  private readonly load = inject(AUTH_API_LOADER);
  private readonly loadNative = inject(NATIVE_AUTH_LOADER);
  private api: Promise<AuthApi> | undefined;

  readonly user = signal<AuthUser | null>(null);
  readonly state = signal<AuthState>('off');
  /** Chyba z návratu po přesměrování (nainstalovaná PWA). */
  readonly redirectError = signal<AuthError | null>(null);
  readonly email = computed(() => this.user()?.email ?? '');

  constructor() {
    if (hasSession()) {
      void this.start();
    }
  }

  /** Načte Firebase Auth (jednou) a začne sledovat přihlášení. */
  start(): Promise<AuthApi> {
    if (!this.api) {
      this.state.set('loading');
      this.api = this.load().then((api) => {
        api.onChange((user) => {
          this.user.set(user);
          this.state.set(user ? 'signedIn' : 'signedOut');
          writeSession(user !== null);
        });
        // V Android aplikaci se přesměrování nepoužívá (Auth bez popupu a přesměrování, viz firebase-auth.ts)
        if (!Capacitor.isNativePlatform()) {
          api.redirectResult().catch((error: unknown) => this.redirectError.set(authErrorOf(error)));
        }
        return api;
      });
      // Chunk se nenačetl (offline): příští pokus ho zkusí znovu
      this.api.catch(() => {
        this.api = undefined;
        this.state.set('off');
      });
    }
    return this.api;
  }

  /** Přihlášení popupem, v Android aplikaci nativně; vrací chybu, null = přihlášeno. */
  async signIn(): Promise<AuthError | null> {
    try {
      const api = await this.start();
      // Android: Google přihlášení ve WebView neprojde, idToken z nativního pluginu přihlásí webové SDK (F9)
      if (Capacitor.isNativePlatform()) {
        const native = await this.loadNative();
        await api.signInWithIdToken(await native.signIn());
        return null;
      }
      // Vždy popup, i v nainstalované PWA: web běží na GitHub Pages a authDomain je firebaseapp.com (F2),
      // přesměrování by kvůli rozdělenému úložišti třetích stran tiše skončilo bez přihlášení.
      // isStandalone() a signInRedirect zůstávají připravené pro případ hostingu na Firebase Hosting.
      await api.signInPopup();
      return null;
    } catch (error) {
      return authErrorOf(error);
    }
  }

  async signOut(): Promise<void> {
    const api = await this.start();
    await api.signOut();
    // Odhlášení i z nativního Google účtu, aby další přihlášení nabídlo výběr účtu
    if (Capacitor.isNativePlatform()) {
      await (await this.loadNative()).signOut();
    }
  }
}
