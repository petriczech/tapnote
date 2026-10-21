/**
 * Otisk buildu pro obrazovku Nastavení. Slouží k jedinému: poznat, jestli zařízení běží
 * na tom, co bylo naposled nasazeno – service worker umí novou verzi držet o jedno
 * spuštění zpátky a bez tohohle údaje se to hádá.
 *
 * Datum se bere z `ngsw.json`, který si build generuje sám a razítkuje časem sestavení.
 * Žádný generovaný zdroják ani krok navíc v `package.json` tím pádem není potřeba.
 */

/** Tvar `ngsw.json`, ze kterého se čte jen razítko. */
interface ServiceWorkerManifest {
  readonly timestamp?: unknown;
}

/** Formát `RR.M.D-HHMM` v místním čase, např. `26.9.21-1955`. */
export function formatBuildStamp(timestamp: number): string {
  const at = new Date(timestamp);
  const year = String(at.getFullYear()).slice(-2);
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${year}.${at.getMonth() + 1}.${at.getDate()}-${time}`;
}

/**
 * Přečte razítko buildu. Ve vývojovém serveru `ngsw.json` neexistuje, proto `dev`;
 * když soubor je, ale razítko v něm chybí, zkusí se ještě hash hlavního skriptu.
 */
export async function loadBuildStamp(
  load: typeof fetch = (input, init) => fetch(input, init),
  doc: Document = document,
): Promise<string> {
  try {
    const response = await load('ngsw.json', { cache: 'no-store' });
    if (response.ok) {
      const manifest: unknown = await response.json();
      const timestamp = (manifest as ServiceWorkerManifest).timestamp;
      if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
        return formatBuildStamp(timestamp);
      }
    }
  } catch {
    // Vývojový server nebo offline start – níž je náhrada z názvu skriptu.
  }
  return buildId(doc);
}

/**
 * Náhradní otisk z názvu hlavního skriptu (`main-XXXXXXXX.js`), který Angular hashuje
 * obsahem. Nese míň informace než datum, ale mění se se stejnou spolehlivostí.
 */
export function buildId(doc: Document = document): string {
  const scripts = [...doc.querySelectorAll('script[src]')];
  for (const script of scripts) {
    const src = script.getAttribute('src') ?? '';
    const name = src.split('/').pop() ?? '';
    const match = /^main-([A-Za-z0-9_-]+)\.js$/.exec(name);
    if (match !== null) {
      return match[1];
    }
  }
  return 'dev';
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
