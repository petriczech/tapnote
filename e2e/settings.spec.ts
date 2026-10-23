import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const meta = (scheme: 'light' | 'dark') => `meta[name="theme-color"][media*="${scheme}"]`;
const surface = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim());

// Vzhled je podstránka rozcestníku: řádek „Vzhled“ s aktuálním motivem vede na /settings/vzhled
async function openAppearance(page: Page): Promise<void> {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeVisible();
  await page.getByRole('link', { name: /^Vzhled/ }).click();
  await expect(page).toHaveURL(/\/settings\/vzhled$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Vzhled' })).toBeVisible();
}

// Změna vzhledu se projeví hned, přežije reload a barva lišty (theme-color) jde s ní
test('nastavení: vzhled se uloží a theme-color ho následuje', async ({ page, axe }) => {
  await openAppearance(page);
  await expect(page.getByRole('radio', { name: 'Noir' })).toBeChecked();
  await axe('nastavení – vzhled');

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

  // Drobečky vrací na rozcestník, řádek Vzhled ukazuje nový motiv
  await page.getByRole('link', { name: 'Nastavení', exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole('link', { name: /^Vzhled/ })).toContainText('Papír');
});

// Rozcestník: řádky sekcí, Nastavení v liště aktuální na rozcestníku i ve Vzhledu, řádek skočí na nadpis sekce
test('nastavení: rozcestník a aktuální záložka v liště', async ({ page, axe }) => {
  const current = page.getByRole('navigation', { name: 'Pohledy' }).getByRole('link', { name: 'Nastavení' });
  await page.goto('/settings');
  await expect(current).toHaveAttribute('aria-current', 'page');
  for (const name of ['Kategorie', 'Šablony', 'Záloha', 'Klávesové zkratky', 'O aplikaci']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
  }
  await axe('nastavení – rozcestník');

  await page.getByRole('link', { name: 'Šablony', exact: true }).click();
  await expect(page).toHaveURL(/\/settings#templates$/);
  await expect(page.getByRole('heading', { name: 'Šablony' })).toBeFocused();

  await page.getByRole('link', { name: /^Vzhled/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vzhled' })).toBeVisible();
  await expect(current).toHaveAttribute('aria-current', 'page');
});

// Deep linky ze seznamu: klávesa ? na stránku zkratek a „Zálohovat“ na zálohu, vždy s fokusem na nadpisu; starý #shortcuts se přesměruje
test('nastavení: ? vede na stránku zkratek a Zálohovat na sekci', async ({ page, seed, axe }) => {
  await seed({ notes: [{ id: 'stara', content: 'Stará poznámka', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z' }] });
  await page.goto('/notes');
  await expect(page.getByRole('link', { name: 'Zálohovat' })).toBeVisible();
  await page.keyboard.press('?');
  await expect(page).toHaveURL(/\/settings\/zkratky$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Klávesové zkratky' })).toBeFocused();

  await page.goto('/settings#shortcuts');
  await expect(page).toHaveURL(/\/settings\/zkratky$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Klávesové zkratky' })).toBeFocused();
  await axe('nastavení – zkratky');

  await page.goto('/notes');
  await page.getByRole('link', { name: 'Zálohovat' }).click();
  await expect(page).toHaveURL(/\/settings#backup$/);
  await expect(page.getByRole('heading', { name: 'Záloha', exact: true })).toBeFocused();
});

// Vynucený tmavý režim při světlém systému: atribut, tmavé tokeny, obě barvy lišty tmavé, přežije reload; Systém vrací výchozí stav
test('nastavení: režim Tmavý se uloží a Systém ho vrátí', async ({ page, axe }, testInfo) => {
  test.skip(testInfo.project.name !== 'light', 'Vynucený tmavý režim se ověřuje proti světlému systému');
  await openAppearance(page);
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

// Přepínač záře v Noiru: vypnutí nastaví atribut a skryje záři, volba přežije reload; v jiném vzhledu přepínač není
test('nastavení: ambientní přechody se vypnou a přežijí reload', async ({ page, axe }) => {
  await openAppearance(page);
  const toggle = page.getByRole('switch', { name: 'Ambientní přechody' });
  await expect(toggle).toBeChecked();
  await expect(page.locator('html')).not.toHaveAttribute('data-ambient');

  await toggle.uncheck();
  await expect(page.locator('html')).toHaveAttribute('data-ambient', 'off');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body, '::before').content)).toBe('none');

  await page.reload();
  await expect(page.getByRole('switch', { name: 'Ambientní přechody' })).not.toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-ambient', 'off');
  await axe('nastavení s vypnutými ambientními přechody');

  await page.getByRole('radio', { name: 'Papír' }).check();
  await expect(page.getByRole('switch', { name: 'Ambientní přechody' })).toHaveCount(0);
});
