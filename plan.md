# Notes App – plán projektu

Osobní mobilní aplikace na poznámky. Offline, bez serveru, bez účtu. Priorita: **okamžitý zápis jedním tapnutím**.

## Shrnutí rozhodnutí

- **Stack:** Angular (standalone, signals) + Dexie (IndexedDB) + Capacitor (Android).
- **Vývoj:** jako PWA v prohlížeči, APK přes `npx cap sync android` + Android Studio.
- **Data:** pouze lokálně (Dexie). Žádná DB na serveru, žádný sync. Záloha = export/import JSON.
- **Kotlin:** jen nativní doplňky uvnitř Capacitor projektu (widget, Quick Settings tile, pin shortcut). Celý přepis do Kotlinu jen pokud POC narazí na limity. JSON export je kontrakt mezi verzemi.
- **Pozicování:** rychlost zápisu jako Google Keep + Markdown a otevřená data jako Obsidian + soukromí (data jen u uživatele).

## Scope

### MVP
- [x] **One-tap zápis:** výchozí route `/` = editor nové poznámky; seznam až za zpět/menu
  - poznámka vznikne až při prvním znaku (lazy create), prázdné se neukládají
  - návrat do 5 min → pokračovat v rozepsané poznámce (konfigurovatelné)
  - klávesnice hned otevřená (Capacitor: `windowSoftInputMode="stateAlwaysVisible"` + autofocus / `Keyboard.show()`)
- [x] **Zkratka „Nová poznámka“:** PWA manifest `shortcuts` → `/new`; Android `shortcuts.xml` (dlouhý stisk ikony, přetažení na plochu)
- [x] **Markdown editor:** lehký (`textarea` nebo CodeMirror 6), živý náhled; uloženo jako čistý Markdown
- [x] **Checklisty:** `- [ ]` toggle tapnutím, hotové položky dolů + sbalit
- [x] **Organizace:** tagy, připnutí, archiv, koš (automatické smazání po 30 dnech)
- [x] **Hledání:** MiniSearch v paměti (fuzzy, prefix, tagy)
- [x] **Export/import JSON:** export přes share sheet / download; import přes file picker; validace + migrace podle `schemaVersion`; merge podle `id` + `updatedAt` nebo „nahradit vše“
- [x] **Připomínka zálohy:** „bez zálohy X dní“

### Fáze 2
- [x] **Šablony:** poznámka s `isTemplate: true`; výběr u „+“; proměnné `{{date}}`, `{{time}}`, `{{weekday}}`, `{{cursor}}`; výchozí tagy a barva
- [x] Barvy poznámek + přepínač grid/list
- [x] Historie verzí (snapshot po pauze v psaní, posledních ~20)
- [ ] **Quick Settings tile** (nativní `TileService`) → otevře editor

### Fáze 2b (úkoly, kategorie, design)
- [x] **Návrh designu soutěží subagentů:** 4 subagenti navrhnou nezávisle atraktivnější vzhled (mockupy v `.tmp/mockup/`, včetně záložek Úkoly/Poznámky a kategorií), pak se navzájem anonymně ohodnotí podle společných kritérií (čitelnost, rychlost zápisu, přístupnost WCAG AA, konzistence, „wow“); výběr z top 2–3 dělá uživatel, výsledek se zapracuje do tokenů a stylů
- [x] **Bílé téma:** čtvrtý vzhled „Bílá“ (čistě bílé plochy, jemné stíny, bez barevného nádechu) vedle Modrá / Papír / Grafit, včetně tmavé varianty
- [x] **Úkoly à la Microsoft To Do:** samostatná záložka „Úkoly“ jako výchozí, „Poznámky“ druhá, dál Archiv, Koš, Nastavení
  - úkol: název, hotovo, důležitý (hvězdička), termín, kroky (podúkoly), poznámka k úkolu
  - hotové úkoly dolů a sbalitelné, rychlé přidání úkolu nahoře / u „+“
  - pohledy: Můj den, Důležité, Naplánované, Vše (podle MS To Do; rozsah upřesnit)
- [x] **Ikona aplikace v záhlaví:** logo Tapnote (kartička s checklistem) vedle nadpisu v hlavičce seznamů
- [x] **Hezčí sada ikon:** nahradit Material ikony jednou ze 3 vybraných sad zdarma (srovnání v `.tmp/mockup/ikony/`)
- [x] **Kategorie:** vlastní kategorie s názvem, ikonou (výběr z připravené sady) a barvou; přiřazení k úkolům i poznámkám; filtr podle kategorie v seznamu; správa kategorií v Nastavení (přidat, přejmenovat, změnit ikonu/barvu, smazat, pořadí)

#### Design Konfety – plán zapracování
Vítěz soutěže je návrh B „Konfety“ (`.tmp/mockup/soutez/B.html`, 39,6 bodu). Zapracuje se ve zklidněné podobě a s rychlými čipy z návrhu D.

**Co se přebírá z B**
- **Písma:** Bricolage Grotesque na nadpisy, Nunito na text.
  - Písma se přibalí do aplikace jako woff2 (latin + latin-ext) v `public/fonts`, ne z Google Fonts. Aplikace je offline a nemá volat cizí servery.
  - Velikost písem se hlídá v rozpočtu buildu.
- **Paleta Konfety:** krémové pozadí, fialová primární barva `#5b2ee8`, slunečnicově žlutá `#ffc53d` na FAB „Nová“. Tmavá varianta je švestková.
  - Tokeny se namapují na stávající názvy (`--primary`, `--surface`, `--on-surface` …), komponenty se kvůli tomu nepřepisují.
- **Kategorie:** 8 sytých barev (`--c-*`) a k nim světlé podklady (`--t-*`) pro světlý i tmavý režim. Sada asi 16 ikon kategorií jako inline SVG.
- **Tvary:** velká zaoblení, měkké stíny (`--shadow`, `--shadow-pop`) a tučné nadpisy obrazovek.
- **Úkoly:**
  - kroužek postupu dne (3/8);
  - dlaždice pohledů Můj den / Důležité / Naplánované / Vše s počty;
  - sbalená sekce „Hotové (n)“.
- **Prázdné stavy:** ilustrace s textem, například koš „Tady je čisto!“.
- **Bílé téma:** bílé plochy, fialový akcent, jemné stíny.

**Zklidnění seznamu úkolů (oproti B)**
- Na řádku je jen jeden řádek metadat. Barevné štítky na řádku nejsou.
  - Kategorie se pozná podle barvy kroužku hotovo a malé tečky s názvem, napsané obyčejným textem.
  - Termín je zvýrazněný jen u „Dnes“ a u zpožděných úkolů, jinak je to obyčejný text.
- Název úkolu má váhu 600 (v B 800). Metadata mají nejméně 13 px a kontrast nejméně 4,5 : 1.
- Nevyplněná hvězdička je tlumená, barvu má jen u důležitých úkolů.
- Pole „Přidat úkol…“ je plné, ne čárkované, aby nezaniklo.
- Popisky spodní navigace mají nejméně 12 px.

**Rychlé čipy u přidání úkolu (z D)**
- Pod polem jsou čipy **Termín**, **Kategorie** a **Důležité**. Vybraný čip ukazuje hodnotu, například „Zítra“ nebo „Práce“.
  - Termín nabízí Dnes, Zítra, Příští týden a Vybrat datum.
  - Kategorie otevře popover se seznamem kategorií.
  - Důležité funguje jako přepínač (`aria-pressed`).
- Pole má potvrzovací tlačítko. Enter úkol přidá a fokus zůstane v poli pro další úkol.

**Opravy z hodnocení**
- Žlutá poznámka v tmavém režimu nesmí být kalně olivová, tmavé `--note-*` se proto upraví.
- FAB nesmí zakrývat text karty, seznam proto dostane dolní odsazení.

**Pořadí (každý krok má vlastní commit s plným lifecyclem)**
1. **Tokeny a písma:**
   - paleta Konfety (světlá a tmavá) a mapování na stávající tokeny;
   - barvy kategorií, tvary a stíny;
   - přibalená písma;
   - vzhled Bílá;
   - vzhledy Modrá, Papír a Grafit zůstanou jako palety nad stejným tvarem;
   - ověření kontroly přístupnosti (axe) ve všech vzhledech.
2. **Restyle stávajících obrazovek** bez nových funkcí: seznam poznámek, editor, nastavení, spodní lišta, prázdné stavy.
3. **Datový model:** Task, Category, export v2 a migrace z v1.
4. **Záložka Úkoly:**
   - zklidněný seznam, rychlé čipy;
   - pohledy, kroužek postupu, sekce Hotové;
   - spodní navigace s 5 položkami.
5. **Kategorie:**
   - správa v Nastavení (název, ikona, barva, pořadí, smazání);
   - filtr čipy v seznamech;
   - barva kroužku u úkolů.
6. **Mikro-detaily:** konfety u „Hotové“ jen bez `prefers-reduced-motion`, drobné animace.

### Fáze 3 (nativní doplňky)
- [ ] **Widget** (Glance): připnutá poznámka / checklist s odškrtáváním + tlačítko „+“
- [x] `[[odkazy]]` + backlinky (seznam „odkazuje sem“, bez grafu)
- [x] Denní poznámka (jedno tapnutí na dnešní datum)

### Mimo scope
Sync, účty, cloud AI, OCR, hlasové poznámky, připomínky, share target, zámek, kolaborace, databáze à la Notion.

## Architektura

```
src/app/
  core/
    model/          # Note, NotesExport, typy + type guards
    storage/        # NotesRepository (rozhraní) + DexieNotesRepository
    search/         # SearchService (MiniSearch)
    backup/         # ExportService, ImportService (validace, migrace, merge)
    platform/       # PlatformService – web vs. Capacitor implementace
    widget/         # WidgetBridge (fáze 3) – snapshot pro nativní widget
  features/
    editor/         # one-tap editor (v initial bundle)
    list/           # seznam, filtry, tagy (lazy)
    search/         # (lazy)
    templates/      # (lazy, fáze 2)
    settings/       # export/import, záloha (lazy)
```

Zásady:
- Business logika v čistých TS službách a funkcích, ne v komponentách (snadný případný přepis do Kotlinu).
- Platformní věci za rozhraním (`PlatformService`, `ShareService`, `FileService`) s web a Capacitor implementací.
- Strict TS, žádné `any`; import pracuje s `unknown` + type guardy.

## Datový model

```ts
interface Note {
  id: string;            // crypto.randomUUID()
  title: string;
  content: string;       // Markdown
  tags: string[];
  color?: string;
  pinned: boolean;
  archived: boolean;
  isTemplate: boolean;
  createdAt: string;     // ISO 8601
  updatedAt: string;     // ISO 8601
  deletedAt?: string;    // koš (tombstone)
}

// Fáze 2b (návrh)
interface Category {
  id: string;
  name: string;
  icon: string;          // klíč z připravené sady ikon
  color: string;         // název barvy jako u poznámek (var(--note-x))
  order: number;
}

interface Task {
  id: string;
  title: string;
  done: boolean;
  important: boolean;
  dueDate?: string;      // datum bez času (RRRR-MM-DD)
  myDay?: string;        // datum, kdy byl úkol přidán do Můj den
  steps: { id: string; title: string; done: boolean }[];
  note: string;          // Markdown
  categoryId?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  deletedAt?: string;
}
// Note dostane categoryId?: string

interface NotesExport {
  schemaVersion: 1;      // fáze 2b: verze 2 s tasks a categories + migrace z 1
  exportedAt: string;    // ISO 8601
  notes: Note[];
}
```

Dexie schéma: `notes: 'id, updatedAt, pinned, archived, isTemplate, deletedAt, *tags'`

Pravidla:
- žádné auto-increment klíče, žádné Dexie-specifické hodnoty v datech
- formát exportu verzovat a zdokumentovat (JSON Schema v repu)
- přílohy (pokud někdy) jako ZIP (JSON + soubory), ne base64 v JSON

## Výkon a start
- Editor v initial bundle, zbytek lazy-loaded.
- Dexie otevírat paralelně s renderem; zápis debounced (~300 ms).
- Splash minimální (`launchAutoHide`, `launchShowDuration: 0`).
- `navigator.storage.persist()` v PWA režimu.

## Widget (fáze 3) – datový most
- Widget nevidí do IndexedDB ve WebView.
- Aplikace při změně zrcadlí snapshot (připnuté poznámky / checklist) do nativního úložiště (`@capacitor/filesystem` → `Directory.Data`, nebo `@capacitor/preferences`) a zavolá vlastní plugin `WidgetBridge.refresh()`.
- Odškrtnutí ve widgetu → fronta změn v nativním úložišti → aplikace po otevření načte zpět do Dexie.

## Rizika
- **Ztráta dat** při odinstalaci / smazání dat aplikace → export jako záloha + připomínka. Android Auto Backup neověřen pro WebView storage, nespoléhat.
- **Klávesnice v PWA:** `focus()` bez gesta uživatele ji v Chrome spolehlivě neotevře; plně řešitelné až v Capacitoru.
- **Distribuce APK:** sideload pro vlastní potřebu; globální ověřování vývojářů Androidu (2027) → včas založit bezplatný „limited distribution“ účet.

## Pořadí implementace (pro Claude Code)
1. Scaffold: Angular projekt, PWA (`@angular/service-worker`), manifest se `shortcuts`, strict TS, lint
2. `core/model` + Dexie repository + unit testy
3. One-tap editor (route `/`, lazy create, autosave, autofocus)
4. Checklisty v editoru
5. Seznam: tagy, pin, archiv, koš
6. Hledání (MiniSearch)
7. Export/import JSON (validace, migrace, merge) + připomínka zálohy
8. Capacitor Android: build, `windowSoftInputMode`, `shortcuts.xml`, splash
9. Fáze 2: šablony, barvy + grid/list, historie verzí, Quick Settings tile
9b. Fáze 2b: soutěž návrhů designu → bílé téma → datový model (Task, Category, export v2 + migrace) → záložka Úkoly → kategorie (ikona, barva, filtr, správa) → zapracování vybraného designu
10. Fáze 3: widget + WidgetBridge, backlinky, denní poznámka

## Rozhodnuto
- Design: vítěz soutěže Konfety (výchozí), dál Modrá, Papír, Grafit, Bílá, Vzdušná, Zápisník, Noir; ikony Phosphor (Bold, Fill pro aktivní stav); logo kartička s checklistem
- Konfety: krátké konfety po dokončení úkolu, bez nich při omezení animací
- Úkoly: pohledy Můj den, Důležité, Naplánované, Vše
- Kategorie: jedna kategorie na položku, tagy zůstávají volné vedle kategorií
- Historie verzí: jen v zařízení, do zálohy nejde

## Plán na zítra
Pořadí dalších kroků, každý zvlášť s plným lifecyclem a commitem:
1. ✅ **Denní poznámka:** jedním ťuknutím otevřít nebo založit poznámku s dnešním datem (název `RRRR-MM-DD` nebo „Úterý 22. 10.“), z lišty Poznámek a zkratkou; existující dnešní se jen otevře
2. ✅ **`[[odkazy]]` a backlinky:** `[[Název]]` v textu jako odkaz na poznámku (v náhledu klikatelný), dole v editoru seznam „Odkazuje sem“; přejmenování poznámky odkazy neopravuje (zatím)
3. ✅ **Drobnosti z review (odloženo):**
   - pauza pro verzi se měří od `updatedAt`, které mění i připnutí nebo barva; zvážit zvláštní čas poslední úpravy textu
   - zaškrtnutí úkolu se při chybě uložení nevrátí; tlačítko „Nový“ v Úkolech a pole mají podobný název
   - `purgeTrash` čte při startu všechny poznámky; nahradit dotazem přes index `deletedAt`
   - náhledy `theme-color` (stavový řádek) jsou pro všechny vzhledy barvy Konfet
4. **Android:** sestavit APK (`npm run sync:android`) s novými ikonami a ověřit na telefonu klávesnici u tlačítka „Nový“, konfety a historii
5. **Nativní doplňky (fáze 2/3):** Quick Settings tile a widget až po ověření APK

## Přepracování podle návrhu D Noir
Hlavní vzhled je návrh D „Tapnote Noir“ (`.tmp/mockup/soutez/D-dark.png`, `D.html`); ostatní obrazovky a vzhledy přebírají jeho rozvržení. Podklady: `.tmp/mockup/redesign-d/ux.md`, `grafika.md`, `testing.md`.

**Co už appka má (jen restyle):** spodní lišta se stejnými 5 záložkami, prstenec postupu, čipy pohledů s počty, rychlé čipy Termín/Kategorie/Důležité, hvězdička, Připnuté/Ostatní, mřížka/seznam, hledání Ctrl+F, „Uloženo“, sekce Hotové (n).

### Rozhodnutí před startem (schváleno 21. 10. 2026 podle návrhu v závorce)
1. Výchozí režim: Systém, nebo Tmavý? (Systém; Noir má světlou i tmavou variantu)
2. Vzhledy: ponechat Noir, Bílá, Modrá, Papír, Grafit; Konfety, Vzdušná a Zápisník zrušit s převodem uložené volby (konfety→noir, airy→blue, notebook→paper) a odebrat písma Nunito a Bricolage (−135 kB v prefetch)? (ano)
3. Bílá: černý akcent z náhledu D, nebo dál fialová? (černý)
4. FAB „Nový“ na Úkolech: D ho nemá, pole přidání je v horní třetině mimo dosah palce. (FAB ponechat)
5. Hotové položky checklistu: dnes padají dolů a sbalí se, D je nechává na místě přeškrtnuté. (ponechat dnešní chování)
6. Nové funkce z mockupu — každá zvlášť ano/ne: tučné písmo (potřebuje vykreslování inline Markdownu v náhledu), vložení obrázku (v rozporu s „přílohy až jako ZIP“), přetažení položek a kategorií (šipky ▲▼ zůstanou kvůli WCAG 2.5.7), Nastavení jako rozcestník s podstránkami „Vzhled“ a „Kategorie“. (zatím jen rozcestník; ostatní odložit)
7. Záchranná síť: commitnutá Playwright smoke sada `e2e/` (6 toků, axe, 412×860 světlý/tmavý) — přidá `@playwright/test` a `@axe-core/playwright` do devDependencies. (ano)

### Kroky (každý s plným lifecyclem a vlastním commitem)
0. ✅ **Smoke sada `e2e/`** před prvním zásahem (po schválení bodu 7); specy se přepisují na role a přístupná jména vždy v kroku, který mění šablonu
1. ✅ **Tokeny Noir jako výchozí:** písma Geist a Geist Mono (OFL, latin-ext, licence do `public/licenses`), sklo (`--glass*`), přechody (`--grad`, tmavý začíná na `#6d4aff`), záře jako jedna pevná vrstva `radial-gradient`, poloměry; blur jen na pevných vrstvách (lišta, panel nástrojů, spodní panel); fallback pro `prefers-reduced-transparency`, `prefers-contrast: more` a bez `backdrop-filter`
2. ✅ **Režim světlý/tmavý/systém:** nový atribut `data-scheme` vedle `data-theme`, tmavé tokeny platí pro media query i atribut, inline skript v `index.html` a `theme-color`; přepínač v Nastavení
3. ✅ **Vzhledy:** převod uložených voleb, dlaždice motivů jako v D, přepínač „Ambientní přechody“ (`data-ambient`, jen Noir)
4. ✅ **Shell:** plovoucí skleněná spodní lišta (radius 24, `env(safe-area-inset-bottom)`), ikony Phosphor Regular v liště a panelu nástrojů (Fill jen hvězda a špendlík), FAB „Nová“ s `--grad` místo `--grad-warm` (kontrast)
5. ✅ **Úkoly – Můj den:** záhlaví s datem a prstencem, čipy, pole přidání, řádky úkolů, Hotové s „dnes 3 · včera 1“
6. ✅ **Poznámky / Archiv / Koš:** mřížka s barevnými hranami karet, náhled checklistu a „4/7“ na kartě, ⋮ menu zůstává (zkratky P/A/Delete)
7. ✅ **Editor – rozvržení:** horní lišta (zpět, Uloženo, Checklist, Hotovo), meta řádek (kategorie, připnuto, upraveno), proužek postupu checklistu, „+ Přidat položku“
8. **Editor – spodní panel nástrojů:** Checklist, Tag, Barva, ⋯ (Historie se přesune sem z horní lišty)
9. **Nastavení jako rozcestník + Vzhled** (podle bodu 6), přesměrování odkazů `?` → zkratky a Zálohovat
10. **Kategorie:** vlastní obrazovka, počty položek, úprava ve spodním panelu na `<dialog>` + `showModal()`, „+ Nová“ dole na dosah palce
11. **Detail úkolu a Historie** dorovnat do stejného jazyka
12. **Nové funkce** jen ty schválené v bodu 6

### Další úkoly po krocích 6–11
13. **Desktop varianta:** kolečko subagentů UX + grafika (návrhy se navzájem oznámkují jako u soutěže designu) pro široké obrazovky, třeba od 900 px. Řeší se:
    - boční navigace místo spodní lišty;
    - seznam a editor vedle sebe;
    - šířka mřížky poznámek;
    - ovládání myší a klávesnicí (hover, zkratky).

    Výstupem bude mockup v `.tmp/mockup/desktop/` a seznam rozhodnutí ke schválení, implementace až potom.
14. **Drag & drop – prověření:** analýza UX a techniky:
    - přetažení poznámky nebo úkolu na kategorii;
    - řazení úkolů, kategorií a položek checklistu;
    - přetažení mezi pohledy (Můj den, Archiv, Koš).

    Pokrýt dotyk, myš i klávesnici. Šipky ▲▼ nebo menu zůstávají jako alternativa kvůli WCAG 2.5.7. Porovná se nativní HTML5 DnD a Angular CDK drag-drop a zhodnotí se dopad na balík a na Android WebView. Výstupem bude návrh ke schválení (navazuje na odložený bod 6 rozhodnutí).

### Hlídat v každém kroku
- Kontrast: bílá na oranžovém konci přechodu má 2,5–3,0 : 1 (nepoužívat pro text), světlý přechodový nadpis končit `#c2410c`, okraje polí přes `--outline`; axe za `backdrop-filter` kontrast nespočítá → ruční vzorkování pixelů a druhý průchod bez průhlednosti
- Cíle dotyku ≥ 44 px, minima písma (navigace 12 px, metadata 13 px) zůstávají i proti menším velikostem v D
- Pevná lišta nesmí zakrýt fokus (WCAG 2.4.11), nativní checkboxy a radia, odkazy s `aria-current`
- Rozpočet stylů komponent 8 kB → sklo a přechody držet v `styles.scss`
- Písma v `/media/*.woff2` (prefetch service workeru) i v APK

## Otevřené
- Úkoly: má `/` (jedno tapnutí) otevírat nový úkol, nebo dál novou poznámku? (zatím poznámka)
- Úkoly: termíny bez notifikací (připomínky jsou mimo scope), nebo připomínky přidat?
- Bílé téma: tmavá varianta jako černá (OLED)? (zatím tmavě šedá)
