import { expect, test } from './fixtures';

// Poznámka s checklistem a [[odkazem]] se otevře v režimu čtení; položka se odškrtne a odkaz vede na cíl s „Odkazuje sem“
test('checklist a [[odkaz]] v režimu čtení', async ({ page, seed, axe }) => {
  await seed({
    notes: [
      { id: 'cil', title: 'Cíl', content: 'Cíl\ntext cílové poznámky' },
      { id: 'nakup', title: 'Nákup', content: 'Nákup\n- [ ] mléko\n- [ ] chleba\nViz [[Cíl]]' },
    ],
  });

  await page.goto('/note/nakup');
  await expect(page.getByRole('button', { name: 'Upravit' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Poznámka' })).toHaveCount(0);
  await axe('poznámka v režimu čtení');

  // Odškrtnutá položka se přesune do sbaleného bloku Hotové, proto click() místo check()
  await page.getByRole('checkbox', { name: 'mléko' }).click();
  await expect(page.getByRole('button', { name: 'Hotové (1)' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'mléko' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hotové (1)' }).click();
  await expect(page.getByRole('checkbox', { name: 'mléko' })).toBeChecked();

  await page.getByRole('link', { name: 'Cíl' }).click();
  await expect(page).toHaveURL(/\/note\/cil$/);
  const backlinks = page.getByRole('navigation', { name: 'Odkazuje sem' });
  await expect(backlinks.getByRole('link', { name: 'Nákup' })).toBeVisible();
  await axe('cíl s Odkazuje sem');

  // Odškrtnutí zůstalo uložené
  await backlinks.getByRole('link', { name: 'Nákup' }).click();
  await expect(page).toHaveURL(/\/note\/nakup$/);
  await expect(page.getByRole('button', { name: 'Hotové (1)' })).toBeVisible();
});
