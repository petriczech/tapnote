import { expect, NOW, test } from './fixtures';

const NOW_ISO = NOW.toISOString();

// Po spuštění aplikace (prázdná cesta) se otevírají úkoly místo editoru
test('úkoly: úvodní stránka po spuštění', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Můj den' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Nový úkol' })).toBeVisible();
});

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

// Po dokončení a po smazání v detailu nabídne lišta Zpět vrácení; úkol se vrátí do seznamu
test('úkoly: Zpět po dokončení a smazání', async ({ page, seed, axe }) => {
  await seed({ tasks: [{ id: 'a', title: 'Mléko', order: 0 }, { id: 'b', title: 'Sýr', order: 1 }] });
  await page.goto('/tasks?view=all');
  const open = page.getByRole('list', { name: 'Úkoly', exact: true });
  const bar = page.getByRole('status').filter({ hasText: /Úkol je/ });
  const back = bar.getByRole('button', { name: 'Zpět' });

  await open.getByRole('checkbox', { name: 'Hotovo: Mléko' }).click();
  await expect(bar).toHaveText(/Úkol je hotový\./);
  await expect(open.getByRole('checkbox', { name: 'Hotovo: Mléko' })).toHaveCount(0);
  await axe('úkoly s lištou Zpět');
  await back.click();
  await expect(open.getByRole('checkbox', { name: 'Hotovo: Mléko' })).not.toBeChecked();
  await expect(back).toHaveCount(0);
  await expect(page.getByText(/^Hotové \(/)).toHaveCount(0);

  await page.getByRole('link', { name: 'Sýr' }).click();
  await page.getByRole('button', { name: 'Smazat' }).click();
  await expect(page).toHaveURL(/\/tasks\?view=all$/);
  await expect(bar).toHaveText(/Úkol je smazaný\./);
  await expect(open.getByRole('link', { name: 'Sýr' })).toHaveCount(0);
  await back.click();
  await expect(open.locator('.title')).toHaveText(['Mléko', 'Sýr']);

  await page.reload();
  await expect(open.locator('.title')).toHaveText(['Mléko', 'Sýr']);
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

// Zkratka „Nový úkol“ (manifest, Android): Můj den s fokusem v poli; parametr z adresy zmizí a zpět/vpřed znovu nefokusuje
test('úkoly: zkratka Nový úkol a klávesa N', async ({ page, axe }) => {
  await page.goto('/notes');
  await page.goto('/tasks?new=1');
  await expect(page.getByRole('heading', { level: 1, name: 'Můj den' })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Nový úkol' });
  await expect(input).toBeFocused();
  await expect(page).toHaveURL(/\/tasks$/);

  await page.keyboard.type('Zavolat domů');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('list', { name: 'Úkoly' }).getByRole('link', { name: 'Zavolat domů' })).toBeVisible();
  await axe('úkoly po zkratce Nový úkol');

  await page.goBack();
  await expect(page).toHaveURL(/\/notes$/);
  await page.goForward();
  await expect(page.getByRole('link', { name: 'Zavolat domů' })).toBeVisible();
  await expect(input).not.toBeFocused();

  // N mimo pole přesune fokus do pole, v poli se píše
  await page.keyboard.press('n');
  await expect(input).toBeFocused();
  await page.keyboard.press('n');
  await expect(input).toHaveValue('n');

  // V otevřené nabídce N nic nedělá, nabídka by jinak zůstala otevřená nad polem
  await page.getByRole('button', { name: 'Termín' }).click();
  await expect(page.getByRole('button', { name: 'Dnes' })).toBeFocused();
  await page.keyboard.press('n');
  await expect(page.getByRole('button', { name: 'Dnes' })).toBeFocused();
  await page.keyboard.press('Escape');

  await page.evaluate(() => localStorage.setItem('tapnote.shortcuts', 'off'));
  await page.reload();
  await expect(page.getByRole('link', { name: 'Zavolat domů' })).toBeVisible();
  await page.keyboard.press('n');
  await expect(input).not.toBeFocused();
});

// Esc v detailu úkolu vrátí na seznam jako odkaz Úkoly; s otevřenou nabídkou v seznamu vedle zavře jen nabídku
test('úkoly: Esc zavře detail úkolu', async ({ page, seed, axe }) => {
  await seed({ tasks: [{ id: 'a', title: 'Mléko', order: 0 }, { id: 'b', title: 'Sýr', order: 1 }] });
  await page.goto('/tasks?view=all');
  await page.getByRole('link', { name: 'Mléko' }).click();
  const title = page.getByRole('textbox', { name: 'Název úkolu' });
  await expect(title).toHaveValue('Mléko');
  await axe('detail úkolu');
  await title.click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/tasks\?view=all$/);
  await expect(page.locator('tn-task-detail')).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/task/a?view=all');
  await expect(title).toHaveValue('Mléko');
  await page.getByRole('button', { name: 'Termín' }).click();
  const today = page.getByRole('button', { name: 'Dnes' });
  await expect(today).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(today).toBeHidden();
  await expect(page).toHaveURL(/\/task\/a\?view=all$/);
  await expect(title).toBeVisible();

  // Esc v poli Nový úkol v seznamu vedle detail nezavře a text zůstane
  const draft = page.getByRole('textbox', { name: 'Nový úkol' });
  await draft.fill('Chleba');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/task\/a\?view=all$/);
  await expect(draft).toHaveValue('Chleba');

  // Esc během tahu myší za úchyt detail nezavře
  const grip = (await page.getByRole('button', { name: 'Přesunout: Sýr' }).boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y - 30, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page).toHaveURL(/\/task\/a\?view=all$/);

  await title.click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/tasks\?view=all$/);
  await expect(page.getByRole('link', { name: 'Mléko' })).toBeFocused();
});
