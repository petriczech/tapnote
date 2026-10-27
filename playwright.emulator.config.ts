import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Testy přihlášení proti Auth emulátoru (port 9102, projekt demo-tapnote); spouští je
// `npm run e2e:emulator` uvnitř `firebase emulators:exec`. Účty v emulátoru se sdílí, proto jeden worker.
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: '**/*.emulator.spec.ts',
  fullyParallel: false,
  workers: 1,
  // Headless shell nedokončí první načtení relay iframe emulátoru (127.0.0.1:9102 uvnitř stránky
  // na localhost), plný Chromium v novém headless režimu ano
  use: { ...base.use, channel: 'chromium' },
});
