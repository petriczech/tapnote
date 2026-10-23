import { expect, test } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

// Od 1200 px seznam poznámek vedle editoru: přepnutí poznámky seznam nepřekreslí, uložení ho obnoví, změna šířky nesmaže rozepsaný text
test('poznámky vedle editoru na 1440 × 900', async ({ page, seed, axe }) => {
  const notes = Array.from({ length: 30 }, (_, i) => {
    const title = `Poznámka ${String(i + 1).padStart(2, '0')}`;
    return { id: `n${i}`, title, content: `${title}\nřádek`, updatedAt: new Date(Date.UTC(2026, 9, 20, 12, 30 - i)).toISOString() };
  });
  await seed({ notes });
  await page.goto('/note/n0');
  const list = page.getByRole('region', { name: 'Poznámky' });
  await expect(list.getByRole('link', { name: /Poznámka 01/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('tn-bottom-nav')).toHaveCount(1);
  await expect(page.locator('[id="obsah"]')).toHaveCount(1);
  await axe('seznam vedle editoru');

  await list.getByRole('link', { name: /Poznámka 20/ }).scrollIntoViewIfNeeded();
  const scrollTop = await list.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await list.evaluate((el) => el.setAttribute('data-e2e', 'stejný'));
  await list.getByRole('link', { name: /Poznámka 20/ }).click();
  await expect(page.getByRole('textbox', { name: 'Poznámka' })).toHaveValue('Poznámka 20\nřádek');
  await expect(list).toHaveAttribute('data-e2e', 'stejný');
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scrollTop);
  await expect(list.getByRole('link', { name: /Poznámka 20/ })).toHaveAttribute('aria-current', 'page');

  const editor = page.getByRole('textbox', { name: 'Poznámka' });
  await editor.press('Control+Home');
  await editor.pressSequentially('Nově ');
  await expect(list.getByRole('link', { name: /Nově Poznámka 20/ })).toBeVisible();
  await editor.press('Control+End');
  await editor.pressSequentially(' a dál');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(list).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(list).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('Nově Poznámka 20\nřádek a dál');

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/notes$/);
  await expect(page.getByRole('link', { name: /Nově Poznámka 20/ })).toBeFocused();
});

// Od 1200 px seznam úkolů vedle detailu: přepnutí úkolu seznam nepřekreslí, otevřený úkol se mění jen v detailu,
// změna šířky nesmaže rozepsaný název, zpět vrátí fokus na řádek úkolu
test('úkoly vedle detailu na 1440 × 900', async ({ page, seed, axe }) => {
  const tasks = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, title: `Úkol ${String(i + 1).padStart(2, '0')}` }));
  await seed({ tasks });
  await page.goto('/task/t0?view=all');
  const list = page.getByRole('region', { name: 'Úkoly' });
  const row = (title: string) => list.getByRole('listitem').filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await expect(list.getByRole('link', { name: 'Úkol 01' })).toHaveAttribute('aria-current', 'page');
  await expect(row('Úkol 01').getByRole('checkbox')).toBeDisabled();
  await expect(page.locator('tn-bottom-nav')).toHaveCount(1);
  await expect(page.locator('[id="obsah"]')).toHaveCount(1);
  await axe('seznam úkolů vedle detailu');

  await list.getByRole('link', { name: 'Úkol 20' }).scrollIntoViewIfNeeded();
  const scrollTop = await list.evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await list.evaluate((el) => el.setAttribute('data-e2e', 'stejný'));
  await list.getByRole('link', { name: 'Úkol 20' }).click();
  const title = page.getByRole('textbox', { name: 'Název úkolu' });
  await expect(title).toHaveValue('Úkol 20');
  await expect(list).toHaveAttribute('data-e2e', 'stejný');
  expect(await list.evaluate((el) => el.scrollTop)).toBe(scrollTop);
  await expect(page).toHaveURL(/\/task\/t19\?view=all$/);

  // Rozepsaný název se uloží i po zaškrtnutí a hvězdě jiného úkolu v seznamu
  await title.fill('Úkol 20 nově');
  await row('Úkol 21').getByRole('checkbox').click();
  await expect(list.getByText('Hotové (1)')).toBeVisible();
  await row('Úkol 22').getByRole('button', { name: 'Důležité: Úkol 22' }).click();
  await expect(row('Úkol 22').getByRole('button', { name: 'Důležité: Úkol 22' })).toHaveAttribute('aria-pressed', 'true');
  await expect(list.getByRole('link', { name: 'Úkol 20 nově' })).toBeVisible();
  await expect(title).toHaveValue('Úkol 20 nově');

  await title.click();
  await title.press('End');
  await title.pressSequentially(' a dál');
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(list).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(list).toBeVisible();
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Úkol 20 nově a dál');

  await page.locator('tn-task-detail').getByRole('link', { name: 'Úkoly' }).click();
  await expect(page).toHaveURL(/\/tasks\?view=all$/);
  await expect(page.getByRole('link', { name: 'Úkol 20 nově a dál' })).toBeFocused();
});
