import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

// Jediný modul, který importuje nativní plugin přihlášení (F9); AuthService ho na Androidu načítá přes import().
// Plugin jen získá Google idToken (skipNativeAuth v capacitor.config.ts), do Firebase se přihlašuje webové SDK,
// aby Firestore ve WebView běžel pod stejným účtem. V unit testech se podstrkuje falešné NativeAuthApi.

export interface NativeAuthApi {
  /** Systémové přihlášení přes Google; vrací idToken pro webové Firebase SDK. */
  signIn(): Promise<string>;
  signOut(): Promise<void>;
}

export function createNativeAuthApi(): NativeAuthApi {
  return {
    signIn: async () => {
      const { credential } = await FirebaseAuthentication.signInWithGoogle();
      if (!credential?.idToken) {
        throw new Error('Google sign-in returned no idToken');
      }
      return credential.idToken;
    },
    signOut: () => FirebaseAuthentication.signOut(),
  };
}
