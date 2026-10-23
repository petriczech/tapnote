import { expect, test } from './fixtures';

test.use({ viewport: { width: 1440, height: 900 } });

// Stránky s panelem na 1440 × 900 bez chyb axe; editor vedle seznamu ověřuje split.spec.ts
test('desktop: axe na Úkolech a Poznámkách v mřížce', async ({ page, seed, axe }) => {
  await seed({
    notes: [
      { id: 'n1', title: 'Nákup', content: 'Nákup\nmléko' },
      { id: 'n2', title: 'Výlet', content: 'Výlet\nbatoh' },
    ],
    tasks: [{ id: 't1', title: 'Zaplatit nájem' }],
  });
  await page.goto('/tasks?view=all');
  await expect(page.getByRole('link', { name: 'Zaplatit nájem' })).toBeVisible();
  await axe('úkoly na desktopu');

  await page.goto('/notes');
  await page.getByRole('button', { name: 'Mřížka' }).click();
  await expect(page.getByRole('button', { name: 'Mřížka' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: /Výlet/ })).toBeVisible();
  await axe('mřížka poznámek na desktopu');
});

// Nastavení a podstránky na střed sloupce bez chyb axe
test('desktop: axe v Nastavení, Vzhledu, Kategoriích a Zkratkách', async ({ page, seed, axe }) => {
  await seed({ categories: [{ id: 'c1', name: 'Domov' }] });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1, name: 'Nastavení' })).toBeVisible();
  await axe('nastavení na desktopu');

  await page.getByRole('link', { name: /^Vzhled/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Vzhled' })).toBeVisible();
  await axe('vzhled na desktopu');

  await page.goto('/settings/kategorie');
  await expect(page.getByRole('heading', { level: 1, name: 'Kategorie' })).toBeVisible();
  await expect(page.getByText('Domov')).toBeVisible();
  await axe('kategorie na desktopu');

  await page.goto('/settings/zkratky');
  await expect(page.getByRole('heading', { level: 1, name: 'Klávesové zkratky' })).toBeFocused();
  await axe('zkratky na desktopu');
});

// Tab vede na „Přeskočit na obsah“, pak panelem a z obsahu dál; přeskočení dá fokus na nadpis stránky
test('desktop: průchod klávesnicí skip link → panel → obsah', async ({ page }) => {
  await page.goto('/notes');
  const heading = page.getByRole('heading', { level: 1, name: /Poznámky/ });
  await expect(heading).toBeAttached();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Přeskočit na obsah' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Nová poznámka' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Dnešní poznámka' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('navigation', { name: 'Pohledy' }).getByRole('link', { name: 'Úkoly' })).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/notes$/);
  await expect(heading).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Mřížka' })).toBeFocused();
});

// Zkratky seznamu: / hledá, Esc hledání vymaže, šipky chodí po kartách, Enter otevře poznámku
test('desktop: zkratky / , šipky, Enter a Esc na seznamu', async ({ page, seed }) => {
  await seed({
    notes: [
      { id: 'n1', title: 'Nákup', content: 'Nákup\nmléko', updatedAt: '2026-10-21T08:00:00.000Z' },
      { id: 'n2', title: 'Výlet', content: 'Výlet\nbatoh', updatedAt: '2026-10-21T07:00:00.000Z' },
    ],
  });
  await page.goto('/notes');
  const first = page.getByRole('link', { name: /Nákup/ });
  const second = page.getByRole('link', { name: /Výlet/ });
  await expect(second).toBeVisible();

  await page.keyboard.press('/');
  const search = page.getByRole('searchbox', { name: 'Hledat' });
  await expect(search).toBeFocused();
  await page.keyboard.type('batoh');
  await expect(first).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await expect(first).toBeVisible();

  await search.blur();
  await page.keyboard.press('ArrowDown');
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(second).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(first).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/note\/n1$/);
  await expect(page.getByRole('textbox', { name: 'Poznámka' })).toHaveValue('Nákup\nmléko');
});

// Přechod přes 1200 px (panel ↔ kolejnice) nepřekreslí stránku Poznámek a fokus na kartě zůstane
test('desktop: změna šířky přes 1200 px drží fokus na Poznámkách', async ({ page, seed }) => {
  await seed({ notes: [{ id: 'n1', title: 'Nákup', content: 'Nákup\nmléko' }] });
  await page.goto('/notes');
  const card = page.getByRole('link', { name: /Nákup/ });
  await card.focus();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(card).toBeFocused();
  await expect(card).toBeInViewport();
});
