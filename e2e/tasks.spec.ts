import { expect, NOW, test } from './fixtures';

const NOW_ISO = NOW.toISOString();

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

// Ruční pořadí v Můj den, Důležité a Vše: tah myší za úchyt ⠿, nabídka úchytu, mezerník a šipky; Naplánované bez úchytu
test('úkoly: řazení úchytem a nabídkou úchytu', async ({ page, seed, axe }) => {
  const today = '2026-10-21';
  await seed({
    tasks: [
      { id: 'a', title: 'Mléko', order: 0, myDay: today },
      { id: 'b', title: 'Chleba', order: 1, important: true },
      { id: 'c', title: 'Sýr', order: 2, myDay: today, dueDate: '2026-10-25' },
      { id: 'd', title: 'Máslo', order: 3, done: true, completedAt: NOW_ISO },
    ],
  });
  await page.goto('/tasks?view=all');
  const open = page.getByRole('list', { name: 'Úkoly', exact: true });
  const titles = open.locator('.title');
  const grip = (name: string) => page.getByRole('button', { name: `Přesunout: ${name}`, exact: true });
  await expect(titles).toHaveText(['Mléko', 'Chleba', 'Sýr']);
  await axe('úkoly s úchyty');

  const from = (await grip('Sýr').boundingBox())!;
  const to = (await grip('Mléko').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  // Kousek nad střed prvního řádku, aby střed taženého řádku přešel jeho střed
  await page.mouse.move(from.x + from.width / 2, to.y, { steps: 10 });
  await page.mouse.up();
  await expect(titles).toHaveText(['Sýr', 'Mléko', 'Chleba']);
  await expect(grip('Sýr')).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Posunout nahoru' })).toHaveAttribute('aria-disabled', 'true');
  await page.getByRole('button', { name: 'Posunout na konec' }).click();
  await expect(titles).toHaveText(['Mléko', 'Chleba', 'Sýr']);
  await expect(grip('Sýr')).toBeFocused();

  await grip('Chleba').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Space');
  await expect(titles).toHaveText(['Chleba', 'Mléko', 'Sýr']);
  await expect(page.locator('li[data-id="d"] .grip')).toHaveCount(0);

  // Můj den ukazuje jen Mléko a Sýr; přesun v něm nezmění pořadí ostatních ve Vše
  await page.getByRole('link', { name: /^Můj den/ }).click();
  await expect(titles).toHaveText(['Mléko', 'Sýr']);
  await grip('Sýr').click();
  await page.getByRole('button', { name: 'Posunout na začátek' }).click();
  await expect(titles).toHaveText(['Sýr', 'Mléko']);

  await page.getByRole('link', { name: /^Naplánované/ }).click();
  await expect(titles).toHaveText(['Sýr']);
  await expect(page.locator('.grip')).toHaveCount(0);

  await page.getByRole('link', { name: /^Vše/ }).click();
  await expect(titles).toHaveText(['Chleba', 'Sýr', 'Mléko']);
  const input = page.getByRole('textbox', { name: 'Nový úkol' });
  await input.fill('Vejce');
  await input.press('Enter');
  await expect(titles).toHaveText(['Vejce', 'Chleba', 'Sýr', 'Mléko']);

  await page.reload();
  await expect(titles).toHaveText(['Vejce', 'Chleba', 'Sýr', 'Mléko']);
});
