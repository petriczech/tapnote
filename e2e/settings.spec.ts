import { expect, test } from './fixtures';

const meta = (scheme: 'light' | 'dark') => `meta[name="theme-color"][media*="${scheme}"]`;

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
