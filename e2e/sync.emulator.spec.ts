import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Přihlášení přes Google v Auth emulátoru: okno emulátoru nabídne nový účet s e-mailem
async function signInWithEmulator(page: Page, email: string): Promise<void> {
  const popupOpened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Přihlásit přes Google' }).click();
  const popup = await popupOpened;
  // Skript okna běží až po načtení material-components-web z unpkg, dřív klik nic neudělá
  await popup.waitForLoadState('load');
  await popup.getByRole('button', { name: 'Add new account' }).click();
  await popup.getByLabel('Email').fill(email);
  await popup.getByRole('button', { name: 'Sign in with Google.com' }).click();
}

// Synchronizace: přihlášení, e-mail na rozcestníku, odhlášení s hláškou; axe v obou stavech
test('synchronizace: přihlášení přes Google a odhlášení', async ({ page, axe }) => {
  const email = `petr-${test.info().project.name}@example.com`;
  await page.goto('/settings');
  const row = page.getByRole('link', { name: /^Synchronizace/ });
  await expect(row).toContainText('Vypnuto');

  await row.click();
  await expect(page).toHaveURL(/\/settings\/synchronizace$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Synchronizace' })).toBeFocused();
  await expect(page.getByText('Bez přihlášení vše zůstává jen v tomto zařízení.', { exact: false })).toBeVisible();
  await axe('synchronizace – odhlášeno');

  await signInWithEmulator(page, email);
  await expect(page.getByText(`Přihlášeno jako ${email}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Odhlásit' })).toBeVisible();
  await axe('synchronizace – přihlášeno');

  // Přihlášení přežije reload a rozcestník ukáže účet
  await page.reload();
  await expect(page.getByText(`Přihlášeno jako ${email}`)).toBeVisible();
  await page.getByRole('link', { name: 'Nastavení', exact: true }).first().click();
  await expect(page.getByRole('link', { name: /^Synchronizace/ })).toContainText(email);

  await page.getByRole('link', { name: /^Synchronizace/ }).click();
  await page.getByRole('button', { name: 'Odhlásit' }).click();
  await expect(page.locator('tn-sync .status')).toHaveText('Odhlášeno. Data v tomto zařízení zůstávají.');
  await expect(page.getByRole('button', { name: 'Přihlásit přes Google' })).toBeFocused();

  await page.getByRole('link', { name: 'Nastavení', exact: true }).first().click();
  await expect(page.getByRole('link', { name: /^Synchronizace/ })).toContainText('Vypnuto');
});
