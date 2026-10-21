import { expect, test } from './fixtures';

// Úkol se přidá, odškrtnutím se přesune do Hotové a dá se vrátit zpět
test('úkoly: přidat, dokončit, vrátit', async ({ page, axe }) => {
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { level: 1, name: 'Můj den' })).toBeVisible();

  const input = page.getByRole('textbox', { name: 'Nový úkol' });
  await input.fill('Koupit mléko');
  await input.press('Enter');
  const open = page.getByRole('list', { name: 'Úkoly' });
  await expect(open.getByRole('checkbox', { name: 'Hotovo: Koupit mléko' })).not.toBeChecked();
  await expect(input).toHaveValue('');
  await axe('úkoly s otevřeným úkolem');

  // Řádek se po kliknutí přesune do jiného seznamu, proto click() místo check()/uncheck()
  await open.getByRole('checkbox', { name: 'Hotovo: Koupit mléko' }).click();
  await expect(open).toBeHidden();
  await page.getByText('Hotové (1)').click();
  const done = page.getByRole('list', { name: 'Hotové úkoly' });
  await expect(done.getByRole('checkbox', { name: 'Hotovo: Koupit mléko' })).toBeChecked();
  await axe('úkoly s rozbalenými hotovými');

  await done.getByRole('checkbox', { name: 'Hotovo: Koupit mléko' }).click();
  await expect(open.getByRole('checkbox', { name: 'Hotovo: Koupit mléko' })).not.toBeChecked();
  await expect(page.getByText(/^Hotové \(/)).toHaveCount(0);
});
