import { expect, test } from './fixtures';

// Archivace, přesun do koše a obnovení přes nabídku akcí a spodní navigaci
test('archiv, koš a obnovení', async ({ page, seed, axe }) => {
  await seed({ notes: [{ id: 'a1', title: 'Stará faktura', content: 'Stará faktura\nzaplaceno' }] });
  const nav = page.getByRole('navigation', { name: 'Pohledy' });
  const card = page.getByRole('link', { name: /Stará faktura/ });
  const actions = page.getByRole('button', { name: 'Akce pro Stará faktura' });

  await page.goto('/notes');
  await expect(card).toBeVisible();
  await actions.click();
  await page.getByRole('button', { name: 'Archivovat' }).click();
  await expect(card).toBeHidden();

  await nav.getByRole('link', { name: 'Archiv' }).click();
  await expect(nav.getByRole('link', { name: 'Archiv' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { level: 1, name: 'Archiv' })).toBeVisible();
  await expect(card).toBeVisible();
  await axe('archiv');
  await actions.click();
  await page.getByRole('button', { name: 'Smazat', exact: true }).click();
  await expect(page.getByText('Archiv je prázdný')).toBeVisible();

  await nav.getByRole('link', { name: 'Koš' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Koš' })).toBeVisible();
  await expect(page.getByText('Stará faktura', { exact: true })).toBeVisible();
  await axe('koš');
  await actions.click();
  await page.getByRole('button', { name: 'Obnovit' }).click();
  await expect(page.getByText('Koš je prázdný')).toBeVisible();

  // Obnovená poznámka se vrátí tam, odkud přišla
  await nav.getByRole('link', { name: 'Archiv' }).click();
  await expect(card).toBeVisible();
});
