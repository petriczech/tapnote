import { test as base, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

// Pevný čas kvůli denní poznámce a datům úkolů
export const NOW = new Date('2026-10-21T09:00:00');

type Item = Record<string, unknown> & { id: string };
type Data = Partial<Record<'notes' | 'tasks' | 'categories', Item[]>>;

// Výchozí hodnoty povinných polí modelů z src/app/core/model
const at = NOW.toISOString();
const DEFAULTS: Record<keyof Data, object> = {
  notes: { title: '', content: '', tags: [], pinned: false, archived: false, isTemplate: false, createdAt: at, updatedAt: at },
  tasks: { done: false, important: false, steps: [], note: '', order: 0, createdAt: at, updatedAt: at },
  categories: { icon: 'home', color: 'green', order: 0, createdAt: at, updatedAt: at },
};

export const test = base.extend<{ seed: (data: Data) => Promise<void>; settle: () => Promise<void>; axe: (name: string) => Promise<void> }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.clock.setFixedTime(NOW);
    await use(page);
    expect(errors, 'chyby stránky').toEqual([]);
  },
  // Zápis do IndexedDB až poté, co aplikace založí schéma Dexie; data se projeví po další navigaci
  seed: async ({ page }, use) =>
    use(async (data) => {
      await page.goto('/notes');
      await page.waitForFunction(async () => (await indexedDB.databases()).some((db) => db.name === 'tapnote' && db.version));
      const filled = Object.fromEntries(
        Object.entries(data).map(([store, items]) => [store, items.map((item) => ({ ...DEFAULTS[store as keyof Data], ...item }))]),
      );
      await page.evaluate(
        (filled) =>
          new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('tapnote');
            request.onsuccess = () => {
              const tx = request.result.transaction(Object.keys(filled), 'readwrite');
              Object.entries(filled).forEach(([store, items]) => items.forEach((item) => tx.objectStore(store).put(item)));
              tx.oncomplete = () => (request.result.close(), resolve());
              tx.onerror = () => reject(tx.error);
            };
          }),
        filled,
      );
    }),
  settle: async ({ page }, use) =>
    use(async () => {
      await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
      await page.evaluate(() => document.fonts.ready);
    }),
  axe: async ({ page, settle }, use) =>
    use(async (name) => {
      await settle();
      const { violations, incomplete } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const contrast = incomplete.filter((item) => item.id === 'color-contrast').flatMap((item) => item.nodes.map((node) => node.target.join(' ')));
      if (contrast.length > 0) {
        console.log(`[${test.info().project.name}] axe ${name}: color-contrast incomplete ${contrast.length}× (${contrast.slice(0, 5).join(', ')})`);
      }
      expect(violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`), `axe: ${name}`).toEqual([]);
    }),
});

export { expect };
