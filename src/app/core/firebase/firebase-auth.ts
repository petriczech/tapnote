import { isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { getApps, initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { emulatorPorts, firebaseConfig } from './firebase.config';

// Jediný modul, který staticky importuje Firebase; AuthService ho načítá přes import() jako samostatný chunk.
// V unit testech se místo něj podstrkuje falešné AuthApi (token AUTH_API_LOADER).

export interface AuthUser {
  uid: string;
  email: string | null;
}

export interface AuthApi {
  onChange(callback: (user: AuthUser | null) => void): void;
  redirectResult(): Promise<unknown>;
  signInPopup(): Promise<unknown>;
  /** Přihlášení Google idTokenem z nativního pluginu (Android). */
  signInWithIdToken(idToken: string): Promise<unknown>;
  signInRedirect(): Promise<void>;
  signOut(): Promise<void>;
}

export function createAuthApi(): AuthApi {
  const app = getApps()[0] ?? initializeApp(firebaseConfig);
  // V Android aplikaci bez popupu a přesměrování: getAuth by ve WebView rovnou načítal iframe z authDomain
  const auth = Capacitor.isNativePlatform() ? initializeAuth(app, { persistence: indexedDBLocalPersistence }) : getAuth(app);
  // Dev build (ng serve, e2e) míří na Auth emulátor projektu demo-tapnote
  if (isDevMode()) {
    connectAuthEmulator(auth, `http://127.0.0.1:${emulatorPorts.auth}`, { disableWarnings: true });
  }
  const provider = new GoogleAuthProvider();
  return {
    onChange: (callback) => onAuthStateChanged(auth, (user) => callback(user && { uid: user.uid, email: user.email })),
    redirectResult: () => getRedirectResult(auth),
    signInPopup: () => signInWithPopup(auth, provider),
    signInWithIdToken: (idToken) => signInWithCredential(auth, GoogleAuthProvider.credential(idToken)),
    signInRedirect: () => signInWithRedirect(auth, provider),
    signOut: () => signOut(auth),
  };
}
