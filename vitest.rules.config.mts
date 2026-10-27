import { defineConfig } from 'vitest/config';

// Rules testy běží mimo `ng test` (vlastní složka `rules-tests/`, prostředí node) přes
// `npm run test:rules`, který spouští emulátor Firestore. Emulátor potřebuje JDK ≥ 21
// (JAVA_HOME se nastavuje jen v shellu příkazu, ne v repu).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['rules-tests/**/*.spec.ts'],
  },
});
