import { AxeBuilder } from '@axe-core/playwright';
import { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, test } from './fixtures';

// Synchronizace dat mezi dvěma kontexty prohlížeče (dvě „zařízení“) proti emulátorům Auth a Firestore.
// Kontexty bez pevného času z fixtures: pravidlo novější vyhrává se řídí skutečným updatedAt.
const PROJECT = 'demo-tapnote';
const AUTH = 'http://127.0.0.1:9102';
const FIRESTORE = 'http://127.0.0.1:8092';
// Testovací účet z allowlistu ve firestore.rules
const OWNER = { uid: 'emulator-owner', email: 'owner@example.com' };
const SHOTS = '.tmp/playwright/s6-sync';

type Row = Record<string, unknown>;

// Účet s uid z allowlistu a Google identitou, aby ho okno emulátoru nabídlo k výběru
async function seedOwner(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchCreate`, {
    headers: { Authorization: 'Bearer owner' },
    data: {
      allowOverwrite: true,
      users: [
        {
          localId: OWNER.uid,
          email: OWNER.email,
          displayName: 'Vlastník',
          providerUserInfo: [{ providerId: 'google.com', rawId: 'owner-google', email: OWNER.email, displayName: 'Vlastník' }],
        },
      ],
    },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function device(browser: Browser, errors: string[]): Promise<Page> {
  const { baseURL, viewport, colorScheme } = test.info().project.use;
  const context = await browser.newContext({ baseURL, viewport, colorScheme, locale: 'cs-CZ', reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  return page;
}

async function signIn(page: Page): Promise<void> {
  await page.goto('/settings/synchronizace');
  const popupOpened = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Přihlásit přes Google' }).click();
  const popup = await popupOpened;
  // Skript okna běží až po načtení material-components-web z unpkg
  await popup.waitForLoadState('load');
  await popup.getByText(OWNER.email).click();
  await expect(page.getByText(`Přihlášeno jako ${OWNER.email}`)).toBeVisible();
}

function readStore(page: Page, store: string): Promise<Row[]> {
  return page.evaluate(
    (store) =>
      new Promise<Row[]>((resolve, reject) => {
        const request = indexedDB.open('tapnote');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const all = request.result.transaction(store).objectStore(store).getAll();
          all.onsuccess = () => (request.result.close(), resolve(all.result));
          all.onerror = () => reject(all.error);
        };
      }),
    store,
  );
}

// První sloučení proběhlo a fronta je odeslaná
async function settled(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const marker = await page.evaluate((key) => localStorage.getItem(key), `tapnote.sync.${OWNER.uid}`);
        return marker !== null && JSON.parse(marker).initialized === true && (await readStore(page, 'outbox')).length === 0;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

// Záznam dorazil posluchačem Firestore do IndexedDB druhého zařízení
async function arrived(page: Page, store: string, match: (row: Row) => boolean): Promise<void> {
  await expect.poll(async () => (await readStore(page, store)).some(match), { timeout: 20_000 }).toBe(true);
}

async function writeNote(page: Page, text: string): Promise<void> {
  await page.goto('/new');
  await page.getByRole('textbox', { name: 'Poznámka' }).fill(text);
  await expect(page.getByText('Uloženo')).toBeVisible();
}

test.describe('synchronizace dat mezi zařízeními', () => {
  let errors: string[];

  test.beforeEach(async ({ request }) => {
    errors = [];
    test.skip(test.info().project.name !== 'light', 'vzhled na synchronizaci nemá vliv');
    test.setTimeout(120_000);
    await seedOwner(request);
    const cleared = await request.delete(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
    expect(cleared.ok()).toBe(true);
  });

  test.afterEach(() => expect(errors, 'chyby stránky').toEqual([]));

  test('první přihlášení sloučí místní data obou zařízení', async ({ browser }) => {
    const a = await device(browser, errors);
    const b = await device(browser, errors);
    await writeNote(a, 'Z prvního zařízení\nmísto A');
    await writeNote(b, 'Z druhého zařízení\nmísto B');

    await signIn(b);
    await settled(b);
    await signIn(a);
    await settled(a);

    // A stáhlo poznámku z B a nahrálo svou; B ji dostane posluchačem bez reloadu
    await a.goto('/notes');
    await expect(a.getByRole('link', { name: /Z prvního zařízení/ })).toBeVisible();
    await expect(a.getByRole('link', { name: /Z druhého zařízení/ })).toBeVisible();
    await arrived(b, 'notes', (row) => row['title'] === 'Z prvního zařízení');
    await b.goto('/notes');
    await expect(b.getByRole('link', { name: /Z prvního zařízení/ })).toBeVisible();
    await expect(b.getByRole('link', { name: /Z druhého zařízení/ })).toBeVisible();
    await a.screenshot({ path: `${SHOTS}/merge-a.png` });
    await b.screenshot({ path: `${SHOTS}/merge-b.png` });
  });

  test('úkol, úprava poznámky a smazání do koše se přenesou', async ({ browser }) => {
    const a = await device(browser, errors);
    const b = await device(browser, errors);
    await signIn(a);
    await signIn(b);
    await settled(a);
    await settled(b);

    // Úkol z A se objeví v B
    await a.goto('/tasks');
    const input = a.getByRole('textbox', { name: 'Nový úkol' });
    await input.fill('Koupit mléko');
    await input.press('Enter');
    await settled(a);
    await arrived(b, 'tasks', (row) => row['title'] === 'Koupit mléko');
    await b.goto('/tasks');
    await expect(b.getByRole('checkbox', { name: 'Hotovo: Koupit mléko' })).toBeVisible();
    await b.screenshot({ path: `${SHOTS}/task-b.png` });

    // Poznámka z A, úprava v B je novější a vrátí se do A
    await writeNote(a, 'Nákupní seznam\nchleba');
    await settled(a);
    await arrived(b, 'notes', (row) => row['title'] === 'Nákupní seznam');
    await b.goto('/notes');
    await b.getByRole('link', { name: /Nákupní seznam/ }).click();
    await expect(b.getByRole('textbox', { name: 'Poznámka' })).toHaveValue('Nákupní seznam\nchleba');
    await b.getByRole('textbox', { name: 'Poznámka' }).fill('Nákupní seznam\nchleba a mléko');
    await expect(b.getByText('Uloženo')).toBeVisible();
    await settled(b);
    await arrived(a, 'notes', (row) => row['content'] === 'Nákupní seznam\nchleba a mléko');
    await a.goto('/notes');
    await expect(a.getByRole('link', { name: /chleba a mléko/ })).toBeVisible();
    await a.screenshot({ path: `${SHOTS}/edit-a.png` });

    // Smazání do koše v A (měkké smazání) se v B projeví v Koši
    await a.getByRole('button', { name: 'Akce pro Nákupní seznam' }).click();
    await a.getByRole('button', { name: 'Smazat', exact: true }).click();
    await expect(a.getByRole('link', { name: /Nákupní seznam/ })).toBeHidden();
    await settled(a);
    await arrived(b, 'notes', (row) => row['title'] === 'Nákupní seznam' && typeof row['deletedAt'] === 'string');
    await b.goto('/notes');
    await expect(b.getByRole('link', { name: /Nákupní seznam/ })).toBeHidden();
    const nav = b.getByRole('navigation', { name: 'Pohledy' });
    await nav.getByRole('link', { name: 'Koš' }).click();
    await expect(b.getByText('Nákupní seznam', { exact: true })).toBeVisible();
    await b.screenshot({ path: `${SHOTS}/trash-b.png` });
  });

  test('trvalé smazání kategorie se projeví i v zařízení, které bylo zavřené', async ({ browser }) => {
    const a = await device(browser, errors);
    const b = await device(browser, errors);
    await signIn(a);
    await signIn(b);
    await settled(a);
    await settled(b);

    await a.goto('/settings/kategorie');
    await a.getByRole('button', { name: 'Přidat kategorii' }).click();
    const sheet = a.getByRole('dialog', { name: 'Nová kategorie' });
    await sheet.getByRole('textbox', { name: 'Název' }).fill('Práce');
    await sheet.getByRole('button', { name: 'Uložit' }).click();
    await settled(a);
    await arrived(b, 'categories', (row) => row['name'] === 'Práce');

    // B se zavře, A kategorii trvale smaže (náhrobek ve Firestore)
    const context = b.context();
    await b.close();
    a.once('dialog', (dialog) => void dialog.accept());
    await a.getByRole('button', { name: 'Upravit: Práce' }).click();
    await a.getByRole('dialog', { name: 'Upravit kategorii' }).getByRole('button', { name: 'Smazat' }).click();
    await expect(a.getByRole('button', { name: 'Upravit: Práce' })).toBeHidden();
    await settled(a);

    // Znovu otevřené B stáhne změny od uloženého kurzoru a kategorii smaže
    const reopened = await context.newPage();
    reopened.on('pageerror', (error) => errors.push(error.message));
    await reopened.goto('/tasks');
    await expect.poll(async () => (await readStore(reopened, 'categories')).length, { timeout: 20_000 }).toBe(0);
    await reopened.goto('/settings/kategorie');
    await expect(reopened.getByRole('heading', { level: 1, name: 'Kategorie' })).toBeVisible();
    await expect(reopened.getByRole('button', { name: 'Upravit: Práce' })).toBeHidden();
    await reopened.screenshot({ path: `${SHOTS}/category-deleted-b.png` });
  });

  test('otevřená poznámka ukáže úpravu z jiného zařízení a po smazání jinde se zavře', async ({ browser }) => {
    const a = await device(browser, errors);
    const b = await device(browser, errors);
    await signIn(a);
    await signIn(b);
    await settled(a);
    await settled(b);

    await writeNote(a, 'Porada\nbod 1');
    await settled(a);
    await arrived(b, 'notes', (row) => row['title'] === 'Porada');
    await b.goto('/notes');
    await b.getByRole('link', { name: /Porada/ }).click();
    const editorB = b.getByRole('textbox', { name: 'Poznámka' });
    await expect(editorB).toHaveValue('Porada\nbod 1');

    // Úprava v A se v otevřeném editoru B ukáže bez reloadu
    await a.getByRole('textbox', { name: 'Poznámka' }).fill('Porada\nbod 1\nbod 2');
    await expect(editorB).toHaveValue('Porada\nbod 1\nbod 2', { timeout: 20_000 });
    await b.screenshot({ path: `${SHOTS}/open-note-b.png` });

    // Smazání do koše v A zavře poznámku v B jako neexistující
    await a.getByRole('button', { name: 'Další akce' }).click();
    await a.getByRole('button', { name: 'Smazat', exact: true }).click();
    await expect(b).toHaveURL(/\/new$/, { timeout: 20_000 });
    await expect(editorB).toHaveValue('');
    await b.screenshot({ path: `${SHOTS}/open-note-trashed-b.png` });
  });
});

// Ovládání synchronizace na stránce Synchronizace (S7): stav, „Synchronizovat teď“ a smazání dat v cloudu
test.describe('stránka synchronizace', () => {
  let errors: string[];
  const UI_SHOTS = '.tmp/playwright/s7-ui';

  // Počet dokumentů kolekce účtu ve Firestore emulátoru (REST s oprávněním správce)
  const remoteCount = async (request: APIRequestContext, collection: string) => {
    const response = await request.get(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${OWNER.uid}/${collection}`, {
      headers: { Authorization: 'Bearer owner' },
    });
    expect(response.ok()).toBe(true);
    return ((await response.json()) as { documents?: unknown[] }).documents?.length ?? 0;
  };
  const remoteTotal = async (request: APIRequestContext) =>
    (await Promise.all(['notes', 'tasks', 'categories'].map((collection) => remoteCount(request, collection)))).reduce((sum, count) => sum + count, 0);

  async function axe(page: Page, name: string): Promise<void> {
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(violations.map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(' ')).join(', ')}`), `axe: ${name}`).toEqual([]);
  }

  // Mobil 412 a desktop 1440 ve vzhledu projektu (light, dark)
  async function shots(page: Page, name: string): Promise<void> {
    const theme = test.info().project.name;
    await page.screenshot({ path: `${UI_SHOTS}/${name}-412-${theme}.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${UI_SHOTS}/${name}-1440-${theme}.png`, fullPage: true });
    await page.setViewportSize({ width: 412, height: 860 });
  }

  test.beforeEach(async ({ request }) => {
    errors = [];
    test.setTimeout(120_000);
    await seedOwner(request);
    const cleared = await request.delete(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`);
    expect(cleared.ok()).toBe(true);
  });

  test.afterEach(() => expect(errors, 'chyby stránky').toEqual([]));

  test('stav, synchronizace teď a smazání dat v cloudu', async ({ browser, request }) => {
    const page = await device(browser, errors);
    await writeNote(page, 'Poznámka pro cloud\nobsah');
    await signIn(page);
    await settled(page);

    const state = page.locator('tn-sync .card .state');
    await expect(state).toHaveText('Synchronizováno');
    await expect(page.getByText(/^Poslední synchronizace: \S/)).toBeVisible();
    await expect(page.getByText(/^Čeká na odeslání/)).toBeHidden();
    expect(await remoteCount(request, 'notes')).toBe(1);
    await axe(page, 'synchronizace – přihlášeno');
    await shots(page, 'signed-in');

    await page.getByRole('button', { name: 'Synchronizovat teď' }).click();
    await expect(state).toHaveText('Synchronizováno');

    page.once('dialog', (dialog) => {
      expect(dialog.message()).toBe(
        'Smazat data v cloudu? Smažou se poznámky, úkoly a kategorie uložené v cloudu. Data v tomto zařízení zůstanou a účet se odhlásí.',
      );
      void dialog.accept();
    });
    await page.getByRole('button', { name: 'Smazat data v cloudu' }).click();
    await expect(page.locator('tn-sync .status')).toHaveText('Data v cloudu jsou smazaná.');
    await expect(page.getByRole('button', { name: 'Přihlásit přes Google' })).toBeFocused();
    await expect(state).toBeHidden();
    expect(await page.evaluate((key) => localStorage.getItem(key), `tapnote.sync.${OWNER.uid}`)).toBeNull();
    expect(await readStore(page, 'outbox')).toEqual([]);
    await expect.poll(() => remoteTotal(request)).toBe(0);
    await axe(page, 'synchronizace – po smazání cloudu');
    await shots(page, 'cloud-deleted');

    await page.goto('/notes');
    await expect(page.getByRole('link', { name: /Poznámka pro cloud/ })).toBeVisible();
  });
});
