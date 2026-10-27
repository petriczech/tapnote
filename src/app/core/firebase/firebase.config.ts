import { isDevMode } from '@angular/core';
import type { FirebaseOptions } from 'firebase/app';

// Veřejná konfigurace web app (není tajemství, přístup hlídají rules). Dev build míří na
// emulátory pod projektem `demo-tapnote`, prod build na `tapnote-petr`.

/** Porty emulátorů, shodné s `firebase.json`. */
export const emulatorPorts = { auth: 9102, firestore: 8092 } as const;

export const devFirebaseConfig: FirebaseOptions = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-tapnote.firebaseapp.com',
  projectId: 'demo-tapnote',
  appId: 'demo-app-id',
};

// Hodnoty z `npx firebase apps:sdkconfig WEB <appId> --project prod`
export const prodFirebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyBEiO8NqWnxt8JWZI0w8awqIJfmzGjGx10',
  authDomain: 'tapnote-petr.firebaseapp.com',
  projectId: 'tapnote-petr',
  storageBucket: 'tapnote-petr.firebasestorage.app',
  messagingSenderId: '283905492865',
  appId: '1:283905492865:web:2f6e5c5127cc96eb374a80',
};

/** Bez vyplněné produkční konfigurace se synchronizace v prod buildu skrývá. */
export const firebaseConfigured = isDevMode() || prodFirebaseConfig.apiKey !== '';

export const firebaseConfig: FirebaseOptions = isDevMode() ? devFirebaseConfig : prodFirebaseConfig;
