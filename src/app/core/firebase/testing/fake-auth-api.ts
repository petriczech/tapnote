import type { AuthApi, AuthUser } from '../firebase-auth';
import type { NativeAuthApi } from '../native-auth';

// Falešné Firebase Auth pro unit testy: bez sítě, přihlášení a odhlášení se řídí z testu
export class FakeAuthApi implements AuthApi {
  private listener: (user: AuthUser | null) => void = () => undefined;
  /** Uživatel, který se přihlásí po signInPopup / signInRedirect. */
  account: AuthUser = { uid: 'uid-1', email: 'petr@example.com' };
  /** Chyba, kterou vyhodí příští přihlášení (např. { code: 'auth/popup-blocked' }). */
  failWith: unknown = null;
  redirectError: unknown = null;
  readonly calls: string[] = [];

  constructor(private readonly initial: AuthUser | null = null) {}

  onChange(callback: (user: AuthUser | null) => void): void {
    this.listener = callback;
    callback(this.initial);
  }

  redirectResult(): Promise<unknown> {
    return this.redirectError ? Promise.reject(this.redirectError) : Promise.resolve(null);
  }

  signInPopup(): Promise<unknown> {
    return this.signIn('popup');
  }

  signInWithIdToken(idToken: string): Promise<unknown> {
    return this.signIn(`idToken:${idToken}`);
  }

  async signInRedirect(): Promise<void> {
    await this.signIn('redirect');
  }

  async signOut(): Promise<void> {
    this.calls.push('signOut');
    this.listener(null);
  }

  private async signIn(kind: string): Promise<unknown> {
    this.calls.push(kind);
    if (this.failWith) {
      throw this.failWith;
    }
    this.listener(this.account);
    return this.account;
  }
}

// Falešný nativní plugin přihlášení (Android): vrací idToken, nebo chybu jako plugin při zrušení
export class FakeNativeAuthApi implements NativeAuthApi {
  idToken = 'google-id-token';
  /** Chyba, kterou vyhodí příští přihlášení (např. new Error('activity is cancelled by the user.')). */
  failWith: unknown = null;
  readonly calls: string[] = [];

  async signIn(): Promise<string> {
    this.calls.push('signIn');
    if (this.failWith) {
      throw this.failWith;
    }
    return this.idToken;
  }

  async signOut(): Promise<void> {
    this.calls.push('signOut');
  }
}
