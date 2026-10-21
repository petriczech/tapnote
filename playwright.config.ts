import { defineConfig, devices } from '@playwright/test';

const PORT = 4250;
const viewport = { width: 412, height: 860 };

// Smoke testy proti dev serveru; Playwright server spustí a po doběhnutí ukončí
export default defineConfig({
  testDir: 'e2e',
  outputDir: '.tmp/e2e-results',
  reporter: 'list',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'cs-CZ',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'light', use: { ...devices['Desktop Chrome'], viewport, colorScheme: 'light' } },
    { name: 'dark', use: { ...devices['Desktop Chrome'], viewport, colorScheme: 'dark' } },
  ],
  webServer: {
    command: `npx ng serve --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
