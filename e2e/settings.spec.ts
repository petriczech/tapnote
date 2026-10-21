import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const meta = (scheme: 'light' | 'dark') => `meta[name="theme-color"][media*="${scheme}"]`;
const surface = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());

// Změna vzhledu se projeví hned, přežije reload a barva lišty (theme-color) jde s ní
test('nastavení: vzhled se uloží a theme-color ho následuje', async ({ page, axe }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Noir' })).toBeChecked();
  await axe('nastavení');

  await page.getByRole('radio', { name: 'Papír' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator(meta('light'))).toHaveAttribute('content', '#f7f1e3');
  await expect(page.locator(meta('dark'))).toHaveAttribute('content', '#1d1a16');

  await page.reload();
  await expect(page.getByRole('radio', { name: 'Papír' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  await expect(page.locator(meta('light'))).toHaveAttribute('content', '#f7f1e3');
  await expect(page.locator(meta('dark'))).toHaveAttribute('content', '#1d1a16');
  await axe('nastavení ve vzhledu Papír');
});

// Vynucený tmavý režim při světlém systému: atribut, tmavé tokeny, obě barvy lišty tmavé, přežije reload; Systém vrací výchozí stav
test('nastavení: režim Tmavý se uloží a Systém ho vrátí', async ({ page, axe }, testInfo) => {
  test.skip(testInfo.project.name !== 'light', 'Vynucený tmavý režim se ověřuje proti světlému systému');
  await page.goto('/settings');
  const scheme = page.getByRole('group', { name: 'Režim' });
  await expect(scheme.getByRole('radio', { name: 'Systém' })).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-scheme');

  await scheme.getByRole('radio', { name: 'Tmavý' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await expect.poll(() => surface(page)).toBe('#0b0b10');
  await expect(page.locator(meta('light'))).toHaveAttribute('content', '#0b0b10');
  await expect(page.locator(meta('dark'))).toHaveAttribute('content', '#0b0b10');

  await page.reload();
  await expect(scheme.getByRole('radio', { name: 'Tmavý' })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'dark');
  await expect(page.locator(meta('light'))).toHaveAttribute('content', '#0b0b10');
  await expect(page.locator(meta('dark'))).toHaveAttribute('content', '#0b0b10');
  await axe('nastavení v režimu Tmavý');

  await scheme.getByRole('radio', { name: 'Systém' }).check();
  await expect(page.locator('html')).not.toHaveAttribute('data-scheme');
  await expect.poll(() => surface(page)).toBe('#f6f6fa');
  await expect(page.locator(meta('light'))).toHaveAttribute('content', '#f6f6fa');
  await expect(page.locator(meta('dark'))).toHaveAttribute('content', '#0b0b10');

  // Vynucený světlý režim při tmavém systému drží světlé tokeny
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(() => surface(page)).toBe('#0b0b10');
  await scheme.getByRole('radio', { name: 'Světlý' }).check();
  await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');
  await expect.poll(() => surface(page)).toBe('#f6f6fa');
  await expect(page.locator(meta('dark'))).toHaveAttribute('content', '#f6f6fa');
});
