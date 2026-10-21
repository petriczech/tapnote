import { expect, test } from './fixtures';

// Poznámka napsaná v editoru se uloží, objeví se v seznamu a najde ji hledání
test('poznámky: napsat, najít v seznamu a hledáním', async ({ page, axe }) => {
  await page.goto('/new');
  await page.getByRole('textbox', { name: 'Poznámka' }).fill('Recept na buchty\nmouka, tvaroh a švestky');
  await expect(page.getByText('Uloženo')).toBeVisible();
  await axe('editor');

  await page.getByRole('link', { name: 'Seznam' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /Poznámky/ })).toBeAttached();
  const card = page.getByRole('link', { name: /Recept na buchty/ });
  await expect(card).toBeVisible();
  await axe('seznam poznámek');

  const search = page.getByRole('searchbox', { name: 'Hledat' });
  await search.fill('tvaroh');
  await expect(card).toBeVisible();
  await search.fill('pomeranč');
  await expect(card).toBeHidden();
  await expect(page.getByText('Nic nenalezeno pro „pomeranč“')).toBeVisible();
  await axe('hledání bez výsledku');

  await search.fill('');
  await card.click();
  await expect(page.getByRole('textbox', { name: 'Poznámka' })).toHaveValue('Recept na buchty\nmouka, tvaroh a švestky');
});

// Poslední karta se dá odrolovat nad plovoucí lištu i FAB, nic ji nezakrývá
test('poznámky: poslední karta nad spodní lištou', async ({ page, seed }) => {
  const notes = Array.from({ length: 20 }, (_, i) => {
    const title = `Poznámka ${String(i + 1).padStart(2, '0')}`;
    return { id: `n${i}`, title, content: `${title}\nřádek` };
  });
  await seed({ notes });
  await page.goto('/notes');
  const cards = page.getByRole('link', { name: /^Poznámka \d\d/ });
  await expect(cards).toHaveCount(20);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const last = await cards.last().boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Pohledy' }).boundingBox();
  const fab = await page.getByRole('link', { name: 'Nová poznámka' }).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(nav!.y);
  expect(last!.y + last!.height).toBeLessThanOrEqual(fab!.y);
});
