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
