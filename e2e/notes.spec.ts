import { expect, NOW, test } from './fixtures';

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

// Položka checklistu se přesune tahem za úchyt ⠿ i s podpoložkou a menu úchytu; hotové zůstávají dole, pořadí se uloží
test('poznámky: řazení checklistu úchytem a menu úchytu', async ({ page, seed, axe }) => {
  await seed({ notes: [{ id: 'nakup', title: 'Nákup', content: 'Nákup\n- [ ] mléko\n  - [ ] polotučné\n- [ ] chleba\n- [ ] sýr\n- [x] máslo' }] });
  await page.goto('/note/nakup');
  const items = page.locator('.group > label');
  const grip = (name: string) => page.getByRole('button', { name: `Přesunout: ${name}`, exact: true });
  await expect(items).toHaveText(['mléko', 'chleba', 'sýr']);
  await axe('checklist s úchyty');

  const from = (await grip('mléko').boundingBox())!;
  const to = (await grip('chleba').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(items).toHaveText(['chleba', 'mléko', 'sýr']);
  await expect(page.locator('.group').nth(1).locator('.sub label')).toHaveText('polotučné');
  await expect(grip('mléko')).toBeFocused();

  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Posunout na konec' }).click();
  await expect(items).toHaveText(['chleba', 'sýr', 'mléko']);
  await expect(grip('mléko')).toBeFocused();
  await expect(page.getByText('Uloženo')).toBeVisible();

  await page.reload();
  await expect(items).toHaveText(['chleba', 'sýr', 'mléko']);
  await page.getByRole('button', { name: 'Hotové (1)' }).click();
  await expect(page.locator('.checklist.done label')).toHaveText(['máslo']);
});

// Novější verze otevřené poznámky z jiné záložky nepřesune kurzor ani posun textového pole
test('poznámky: kurzor zůstane po změně v jiné záložce', async ({ page, seed, context }) => {
  const content = `Dlouhá\n${Array.from({ length: 80 }, (_, i) => `řádek ${i + 1}`).join('\n')}`;
  await seed({ notes: [{ id: 'dlouha', title: 'Dlouhá', content, updatedAt: '2026-10-20T09:00:00.000Z' }] });
  await page.goto('/note/dlouha');
  const editor = page.getByRole('textbox', { name: 'Poznámka' });
  await expect(editor).toHaveValue(content);
  const caret = content.indexOf('řádek 40');
  await editor.evaluate((textarea: HTMLTextAreaElement, caret) => {
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    textarea.scrollTop = 600;
  }, caret);
  const state = () => editor.evaluate((textarea: HTMLTextAreaElement) => [textarea.selectionStart, textarea.selectionEnd, textarea.scrollTop]);

  const other = await context.newPage();
  await other.goto('/note/dlouha');
  const otherEditor = other.getByRole('textbox', { name: 'Poznámka' });
  await expect(otherEditor).toHaveValue(content);
  await otherEditor.press('Control+End');
  await otherEditor.pressSequentially('\nkonec');
  await expect(editor).toHaveValue(`${content}\nkonec`);
  expect(await state()).toEqual([caret, caret, 600]);

  // Text před kurzorem se změnil: kurzor zůstane před stejným textem za ním
  await page.clock.setFixedTime(new Date(NOW.getTime() + 60_000));
  await otherEditor.press('Control+Home');
  await otherEditor.pressSequentially('Nahoře\n');
  await expect(editor).toHaveValue(`Nahoře\n${content}\nkonec`);
  expect(await state()).toEqual([caret + 7, caret + 7, 600]);
});
