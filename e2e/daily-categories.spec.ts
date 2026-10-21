import { expect, test } from './fixtures';

// /today založí dnešní poznámku (fixní čas = středa 21. 10. 2026) a při dalším otevření vrátí tutéž
test('denní poznámka přes /today', async ({ page, axe }) => {
  await page.goto('/today');
  await expect(page).toHaveURL(/\/note\/[^/]+$/);
  const url = page.url();
  await expect(page.getByRole('textbox', { name: 'Poznámka' })).toHaveValue(/^Středa 21\. října 2026\n#deník/);
  await axe('denní poznámka');

  await page.getByRole('link', { name: 'Seznam' }).click();
  await page.getByRole('link', { name: 'Dnešní poznámka' }).click();
  await expect(page).toHaveURL(url);
});

// Kategorie založená v Nastavení se nabídne u nového úkolu a filtruje seznam úkolů
test('kategorie: založit v nastavení a filtrovat úkoly', async ({ page, axe }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Přidat kategorii' }).click();
  const form = page.getByRole('form', { name: 'Nová kategorie' });
  await form.getByRole('textbox', { name: 'Název' }).fill('Práce');
  await form.getByRole('button', { name: 'Uložit' }).click();
  await expect(page.getByRole('button', { name: 'Upravit: Práce' })).toBeVisible();
  await axe('nastavení s kategorií');

  await page.getByRole('navigation', { name: 'Pohledy' }).getByRole('link', { name: 'Úkoly' }).click();
  const input = page.getByRole('textbox', { name: 'Nový úkol' });
  await input.fill('Poslat nabídku');
  await page.getByRole('button', { name: 'Kategorie' }).click();
  await page.getByRole('button', { name: 'Práce' }).click();
  await input.press('Enter');
  await input.fill('Zalít květiny');
  await input.press('Enter');
  const open = page.getByRole('list', { name: 'Úkoly' });
  await expect(open.getByRole('checkbox')).toHaveCount(2);

  const filters = page.getByRole('navigation', { name: 'Kategorie' });
  await filters.getByRole('link', { name: 'Práce' }).click();
  await expect(filters.getByRole('link', { name: 'Práce' })).toHaveAttribute('aria-current', 'true');
  await expect(open.getByRole('checkbox', { name: 'Hotovo: Poslat nabídku' })).toBeVisible();
  await expect(open.getByRole('checkbox', { name: 'Hotovo: Zalít květiny' })).toHaveCount(0);
  await axe('úkoly filtrované kategorií');

  await filters.getByRole('link', { name: 'Vše' }).click();
  await expect(open.getByRole('checkbox')).toHaveCount(2);
});
