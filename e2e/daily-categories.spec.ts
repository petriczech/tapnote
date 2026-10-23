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

// Kategorie založená v Nastavení › Kategorie se nabídne u nového úkolu a filtruje seznam úkolů
test('kategorie: založit v nastavení a filtrovat úkoly', async ({ page, axe }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Kategorie', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/kategorie$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Kategorie' })).toBeFocused();
  const add = page.getByRole('button', { name: 'Přidat kategorii' });
  await add.click();
  const sheet = page.getByRole('dialog', { name: 'Nová kategorie' });
  await expect(sheet.getByRole('textbox', { name: 'Název' })).toBeFocused();
  await axe('kategorie – nová v panelu');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(add).toBeFocused();

  await add.click();
  await sheet.getByRole('textbox', { name: 'Název' }).fill('Práce');
  await sheet.getByRole('button', { name: 'Uložit' }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole('button', { name: 'Upravit: Práce' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Upravit: Práce' })).toHaveAccessibleDescription('Položek: 0');
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

  // Počet na správě kategorií zahrnuje nový úkol
  await page.goto('/settings/kategorie');
  await expect(page.getByRole('button', { name: 'Upravit: Práce' })).toHaveAccessibleDescription('Položek: 1');
});

// Řazení kategorií úchytem ⠿: klávesnicí (Esc vrátí pozici) i myší; pořadí vydrží reload, ▲▼ zůstávají
test('kategorie: řazení úchytem klávesnicí a myší', async ({ page, seed, axe }) => {
  await seed({
    categories: [
      { id: 'a', name: 'Domov', order: 0 },
      { id: 'b', name: 'Práce', order: 1 },
      { id: 'c', name: 'Škola', order: 2 },
    ],
  });
  await page.goto('/settings/kategorie');
  const names = page.locator('ul.categories .item-name');
  const grip = page.getByRole('button', { name: 'Přesunout: Domov' });
  await expect(names).toHaveText(['Domov', 'Práce', 'Škola']);

  await grip.focus();
  await page.keyboard.press('Space');
  await expect(grip).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(grip).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(names).toHaveText(['Práce', 'Domov', 'Škola']);
  await expect(grip).toBeFocused();
  await axe('kategorie po řazení klávesnicí');

  const from = (await page.getByRole('button', { name: 'Přesunout: Práce' }).boundingBox())!;
  const to = (await page.getByRole('button', { name: 'Přesunout: Škola' }).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height - 4, { steps: 10 });
  await page.mouse.up();
  await expect(names).toHaveText(['Domov', 'Škola', 'Práce']);

  await page.reload();
  await expect(names).toHaveText(['Domov', 'Škola', 'Práce']);
  await expect(page.getByRole('button', { name: 'Posunout nahoru: Škola' })).toBeVisible();
});
