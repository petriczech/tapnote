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
- [x] **Widget** „Můj den“ (Java RemoteViews): připnutá poznámka / checklist s odškrtáváním + tlačítko „+“
- [x] `[[odkazy]]` + backlinky (seznam „odkazuje sem“, bez grafu)
- [x] Denní poznámka (jedno tapnutí na dnešní datum)

### Mimo scope
Kolaborace a sdílení mezi uživateli, cloud AI, OCR, hlasové poznámky, připomínky, share target, zámek, kolaborace, databáze à la Notion.

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
- Aplikace při změně zrcadlí snapshot otevřených úkolů Můj den přes vlastní plugin `WidgetBridge.sync()` do SharedPreferences (hotovo 26. 10. 2026).
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
- ✅ Spuštění aplikace (`/`) i neznámá adresa otevírají Úkoly; obnovení rozepsané poznámky zůstává v kódu nepoužité; nový úkol je i první zkratkou ikony a klávesou N na Úkolech (25. 10. 2026, předtím start na poznámce)
- Úkoly: termíny bez připomínek a notifikací (24. 10. 2026)
- Bílá: tmavá varianta zůstává tmavě šedá, ne černá OLED (24. 10. 2026)

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

## Plán na příště (sepsáno 24. 10. 2026)
Stav: přepracování Noir (kroky 0–11), desktop (15–20), drag & drop (21–23), stránka zkratek (24), zkratka „Nový úkol“ a test ve WebKitu jsou hotové a commitnuté. Body 4 a 5 z „Plánu na zítra“ výš zůstávají a jsou rozepsané tady.

1. **APK a test na telefonu** (sestavuje se ručně: `npm run build`, `npx cap sync android` nebo `npm run sync:android`, pak Android Studio). Na telefonu ověřit:
   - dlouhý stisk ikony: „Nový úkol“ (první, fajfka) a „Nová poznámka“; ze studeného startu i z běžící appky; systémové Zpět nemá znovu dát fokus do pole
   - klávesnice po zkratce, u pole „Nový úkol“ a u tlačítka „Nový“ (známé omezení `focus()` bez gesta)
   - tah za úchyt ⠿ v Kategoriích, checklistu a Úkolech: tah nescrolluje stránku, tah mimo úchyt scrolluje, dlouhý stisk nevybere text, autoscroll u lišty, gesto zpět během tahu vrátí pozici
   - TalkBack: jméno a popis úchytu, hlášky „Uchopeno… / Puštěno na pozici…“, menu úchytu
   - migrace databáze v3 → v4 na skutečných datech (pořadí úkolů zůstane)
   - export a import zálohy přes sdílení; demo záloha `.tmp/demo/tapnote-demo.json` (nová se vytvoří `node .tmp/demo/gen-demo.mjs`)
   - spodní lišta při posunu dlouhého seznamu reaguje na klepnutí (oprava `z-index`)
2. **Opravy z testu na telefonu** – každá zvlášť s lifecyclem. Test v emulátoru (25. 10. 2026) prošel; jediná změna: start na Úkolech. Na skutečném telefonu zbývá TalkBack a migrace v3 → v4.
3. ✅ **Quick Settings tile** (nativní `TileService`): otevře nový úkol (`tapnote://new-task`); na telefonu ověřit přidání dlaždice, zavřenou i běžící appku a zamčenou obrazovku (Android < 14)
4. ✅ **Widget „Můj den“** (26. 10. 2026; místo Glance klasický AppWidget v Javě, místo připnuté poznámky otevřené úkoly Můj den): odškrtnutí, otevření detailu (`tapnote://task/<id>`), „+“ nový úkol, záhlaví otevře Úkoly; most `WidgetBridge` (SharedPreferences), odškrtnutí z widgetu se do Dexie zapíše po otevření appky; po půlnoci prázdný seznam do další synchronizace. Ověřit v emulátoru/telefonu: přidání widgetu, odškrtnutí, detail, „+“, světlý/tmavý, TalkBack, stav po půlnoci a po restartu.
5. ✅ **Další ikony kategorií** (přidáno 8: AI, Bot, Chat, Terminál, Hry, 3D, Vývoj, Projekty; zadáno 26. 10. 2026): pro Unreal Engine, Claude, AI a podobná témata. Sada je Phosphor Bold, ve které značky (UE, Claude) nejsou a jejich loga mají vlastní licenci. Návrh: obecné Phosphor ikony, třeba Sparkle nebo Robot pro AI, GameController nebo Cube pro UE, Terminal nebo Code pro vývoj. Výběr ikon se předloží ke schválení.
6. ✅ **Barvy kategorií** (příčina: červená a oranžová měly skoro stejný odstín; opraveny tokeny `--c-orange`/`--c-red`; dotaz 26. 10. 2026): sada má pevných 8 barev a motiv mění jen jejich odstín pro světlý a tmavý režim. Červená a Oranžová v ní jsou. Ověřit, proč v panelu „Upravit kategorii“ chyběly (přehlédnutelné tečky bez popisku? přetékající řada?), a případně doplnit další barvy.

### Hlasování panelu (28. 10. 2026: UX, designér, kodér, mobilní designér)
- **Ano (pořadí):**
  1. S4 Android sync (4/4, priorita 1)
  2. ✅ D4 Esc v detailu úkolu (28. 10. 2026; otevřené menu nebo dialog se zavře první, Esc v poli „Nový úkol“ vedle detailu a během tahu myší detail nezavře), a na Androidu ověřit, že detail zavře i gesto Zpět (detail je route, Zpět jde v historii; po otevření z widgetu při studeném startu appku ukončí) (4/4)
  3. ✅ D7 + D8 sladit červenou okraje poznámky a `--error` s novou červenou, s auditem kontrastu (28. 10. 2026; 5 motivů × světlý/tmavý bez selhání, `.tmp/playwright/d7-d8-red/contrast.md`; pozadí červené poznámky `--note-red` zůstává v některých motivech narůžovělé) (4/4)
  4. ✅ O7 kurzor po načtení novější verze (28. 10. 2026; zachová se výběr i posun, pravidlo: stejný text před kurzorem → stejná pozice, stejný za ním → stejná vzdálenost od konce, jinak oříznutí) (4/4)
  5. ✅ D3 šipka ↓ v mřížce (28. 10. 2026; jen desktopová mřížka, ↓/↑ na kartu pod/nad) (3/4)
  6. ✅ D5 sjednotit štítek „Ctrl F“ (28. 10. 2026; „Ctrl + F“ s `key-hint`, pravidlo `kbd:not(.key-hint)` je teď nepoužité a zůstává) (4/4)
  7. ✅ D1 ikona zkratky „Nový úkol“ (28. 10. 2026; PWA ikona s fajfkou, Android už vlastní `ic_shortcut_task` měl) (3/4)
- **Ne:** D2, D6, O3 a O4.
- **Později:** O1 (nejdřív menu „Přesunout do…“, drag až potom), O2, O5 a O6.
- **Nové návrhy panelu (čekají na rozhodnutí):**
  - indikátor stavu synchronizace mimo Nastavení (UX + designér)
  - audit kontrastu sémantických barev na všech motivech
  - Undo po odškrtnutí nebo smazání úkolu
  - gesto Zpět na Androidu zavře detail, dialog nebo menu místo ukončení appky
  - test synchronizace proti produkci s posunutými hodinami
  - nabídnout export zálohy před prvním sloučením

### Hlasování panelu 2 (28. 10. 2026: UX, designér, kodér, mobilní designér; čeká na schválení)
- **Ano (pořadí podle bodů):**
  1. ✅ N3 gesto Zpět na Androidu zavře menu/dialog, jinak historie, bez historie Úkoly místo ukončení (i studený start z widgetu) (28. 10. 2026; `core/native/back-button.ts`, z Úkolů `minimizeApp`; netestováno na zařízení, postup v reportu: menu, Kategorie, detail, widget za studena, zkratka Nová poznámka, klávesnice, gesto na Androidu 13+; známé: po zkratce „Nový úkol“ nad otevřenými Úkoly je první Zpět naprázdno) (4/4)
  2. ✅ N5 nabídnout export zálohy před prvním sloučením (28. 10. 2026; na webu hotové; **Android:** „Stáhnout zálohu“ v Nastavení i Synchronizaci zapíše soubor přes `@capacitor/filesystem` do cache a otevře systémové sdílení `@capacitor/share`; zavření nabídky = bez hlášky a bez „Poslední záloha“; cíl otevřený jako dialog nad appkou se může tvářit jako zavření; ověřit na telefonu) (4/4)
  3. N2 „Zpět“ v toastu po odškrtnutí nebo smazání úkolu; vrátí i widget (4/4)
  4. N1 ikona stavu synchronizace v liště (hlavně offline/chyba) (4/4)
  5. N4 ruční test s posunutými hodinami proti produkci, pak varování při `updatedAt` v budoucnosti (3/4)
  - R2 Esc v přehledu zkratek přibalit k libovolnému kroku (4/4)
- **Ne:** R3 smazat `kbd:not(.key-hint)` (4/4).
- **Později:** R1 pozadí červené poznámky (3/4; návrh designéra: Noir `#ffe1de`/`#3a1a1a`, Bílá `#ffe0dd`/`#451d1d`), O1 „Přesunout do…“ (3/4), zkratky N/D, přetažení na kategorii, řazení kroků a podpoložek, tučné písmo, obrázky.
- O2, O5 a O6 nemají v plánu popis, nešlo hlasovat.

### Odloženo (předložit znovu, až bude potřeba)
- globální zkratky N/D a počty u odkazů v panelu (desktop rozhodnutí 10)
- přetažení na kategorii (R7), řazení kroků úkolu (R8), řazení podpoložek checklistu (R3)
- Nastavení na desktopu s rozcestníkem vlevo (S1)
- tučné písmo v náhledu, vkládání obrázků
- úvodní balík +10 kB po přetahování v checklistu (přijato; varianty A/B/C v reportu kroku 22)

### Drobnosti k rozhodnutí
- vlastní ikona PWA zkratky „Nový úkol“ (dnes sdílí ikonu aplikace)
- N vedle detailu úkolu funguje jen s fokusem v seznamu
- šipka ↓ v desktopové mřížce poznámek jde na kartu vpravo, ne pod
- detail úkolu nemá Esc; „Ctrl F“ v hledání vypadá jinak než ostatní štítky; řádek „Klávesové zkratky“ v rozcestníku je mezi Zálohou a O aplikaci
- Safari s výchozím nastavením přeskočí Tabem odkazy (skip link, lišta) – systémové chování, jen zmínit
- ✅ Firefox (26. 10. 2026): celá e2e sada prošla (47/1 skip), `npx playwright test -c .tmp/playwright/firefox/playwright.config.ts`; `position-area` Firefox nemá, menu úchytu má záložní pozici (vzhled neověřen); WebKit sada: `npx playwright test -c .tmp/playwright/webkit/playwright.config.ts`

## Synchronizace přes Firebase (zadáno 27. 10. 2026)
Cíl: stejné poznámky, úkoly a kategorie na telefonu i PC po přihlášení přes Google. Aplikace dál funguje plně offline i bez přihlášení; sync je volitelná nadstavba. Dexie zůstává hlavním úložištěm, Firestore slouží jako vzdálená kopie.

### Rozhodnutí před startem (schváleno 27. 10. 2026 podle návrhu v závorce)
- F1 Lokace Firestore: `eur3` (multi-region EU), nebo `europe-west3` (Frankfurt)? Lokaci nejde nikdy změnit. (`eur3`)
- F2 Hosting webu: zůstává GitHub Pages, nebo přejít na Firebase Hosting (`*.web.app`)? GitHub Pages potřebuje doménu v Authorized domains a přihlášení jen popupem. (zůstat na GitHub Pages)
- F3 Konflikty: vyhrává záznam s novějším `updatedAt` (celý záznam, ne jednotlivá pole)? (ano)
- F4 Co se synchronizuje: poznámky, úkoly, kategorie včetně koše a archivu. Historie verzí, motiv, režim a další nastavení zůstávají jen v zařízení? (ano)
- F5 První přihlášení se sloučí s místními daty (stejná logika jako import zálohy), nic se nemaže? (ano)
- F6 Odhlášení: místní data zůstávají v zařízení, sync se jen zastaví? (ano)
- F7 „Smazat data v cloudu“ v Nastavení: smaže kolekce uživatele ve Firestore, místní data nechá? (ano)
- F8 Firebase SDK se načte až po zapnutí syncu (lazy chunk), takže úvodní balík zůstane malý? (ano)
- F9 Android: přihlášení přes nativní plugin `@capacitor-firebase/authentication`, protože Google přihlášení ve WebView blokuje. (ano)
- F10 Konfigurace v commitnutém `src/app/core/firebase/firebase.config.ts`, ne v `environment*.ts`? (ano)
- F11 Přístup: allowlist uid (jen tvé uid) navíc k pravidlu „jen vlastník svých dat“ (`users/{uid}/…`), nebo jen vlastník bez allowlistu? Bez allowlistu si kdokoli s Google účtem může založit vlastní prostor, který zůstane prázdný a oddělený. (allowlist, appka je osobní)

### Návrh architektury
- Struktura: `users/{uid}/notes/{id}`, `users/{uid}/tasks/{id}` a `users/{uid}/categories/{id}`. Dokument nese stejná pole jako záznam v Dexie plus `serverUpdatedAt` (serverový čas).
- **Odesílání:** repozitáře při zápisu přidají id do fronty `outbox` v Dexie (nová tabulka, migrace v5). Sync službu spustí fronta, start nebo návrat do appky. Po potvrzení zápisu se položka z fronty odebere. Offline se fronta drží a odešle se později.
- **Příjem:** `onSnapshot` na každou kolekci s `serverUpdatedAt > kurzor`. Příchozí záznam se zapíše do Dexie, jen když má novější `updatedAt` než místní (F3). Kurzor se ukládá v Dexie.
- **Mazání:** stačí měkké mazání (`deletedAt`). `purgeTrash` po trvalém smazání smaže i dokument ve Firestore (přes frontu).
- **Offline cache Firestore** je vypnutá (memory cache), protože data drží Dexie. Tím odpadnou problémy s `persistentLocalCache` a s víc taby.
- **UI:** Nastavení › Synchronizace obsahuje:
  - „Přihlásit přes Google“,
  - stav (přihlášený účet, poslední sync, počet čekajících změn, chyba),
  - „Synchronizovat teď“, „Odhlásit“ a „Smazat data v cloudu“.
  - Přesná znění textů se předloží ke schválení.
- **Widget a dlaždice:** beze změny. Widget dostává data z Dexie, takže úkoly ze sync se do něj propíšou samy.
- **Testy:**
  - unit testy sync logiky s falešným vzdáleným úložištěm,
  - rules testy (`@firebase/rules-unit-testing`) a e2e proti emulátorům Auth a Firestore přes `firebase emulators:exec` (vlastní porty, projekt `demo-tapnote`),
  - test na emulátoru Androidu ručně.

### Kroky (každý s plným lifecyclem a vlastním commitem)
S0. Schválení rozhodnutí F1–F11.
S1. ✅ **Firebase projekt** (27. 10. 2026 naklikáno v konzoli; Android app se SHA-1 a `google-services.json` až v S4):
   - projekt `tapnote-<přípona>`, web app a Android app (`cz.petriczech.tapnote`) s otiskem SHA-1 debug klíče,
   - Firestore v lokaci podle F1,
   - Authentication › Google s názvem „Tapnote“,
   - Authorized domain pro GitHub Pages.
S2. ✅ **Kostra:** `firebase.json`, `.firebaserc` (`demo-tapnote` + alias `prod`), `firestore.rules` a rules testy, porty emulátorů, `firebase.config.ts`, závislost `firebase` jako lazy chunk.
S3. ✅ **Přihlášení na webu** (27. 10. 2026; jen popup kvůli F2, v Android aplikaci skryto do S4; `npm run e2e:emulator` potřebuje JDK 21+ a internet): popup, odhlášení, stav účtu v Nastavení, e2e s emulátorem Auth.
S4. ✅ **Přihlášení na Androidu** (28. 10. 2026 kód + `google-services.json` + debug SHA-1; APK sestavené s JDK 21 `C:/Users/Petr/.jdks/jbr-21.0.11`, JBR 25 z Android Studia s Gradle 8.14 nefunguje; čeká na test v emulátoru): plugin, `google-services.json`, SHA-1, ověření v emulátoru.
S5. ✅ **Fronta změn** (27. 10. 2026; Dexie DBCore middleware místo zápisu v repozitářích, `OutboxRepository.applyRemote` pro vzdálené zápisy): tabulka `outbox` (Dexie v5), zápis z repozitářů a migrace. Formát zálohy se nemění.
S6. ✅ **Sync jádro** (27. 10. 2026; náhrobky místo mazání, před prvním odesláním se dotáhnou změny ze serveru, odmítnuté záznamy zůstávají ve frontě; pravidla se nasazují spolu s klientem v S8): odesílání, příjem s kurzorem, pravidlo novější vyhrává, sloučení při prvním přihlášení, mazání. Unit testy a e2e se dvěma kontexty prohlížeče proti emulátoru.
S7. ✅ **UI synchronizace** (27. 10. 2026; „Smazat data v cloudu“ maže kolekce, frontu, marker a odhlásí): stav, chyby, „Synchronizovat teď“, „Smazat data v cloudu“, axe. „Smazat data v cloudu“ vynuluje na tomto zařízení marker a frontu (příští běh = první synchronizace); na ostatních zařízeních stačí odhlásit a znovu přihlásit (odhlášení maže marker).
S8. ✅ **Nasazení** (28. 10. 2026: pravidla s uid vlastníka nasazena, web na GitHub Pages hlásí „Synchronizováno“; zbývá S4 Android): build, `firebase deploy --only firestore --project prod` a push pro GitHub Pages. Pak test na telefonu a PC proti produkci.

### Rizika
- Hodiny zařízení: pravidlo novější vyhrává se řídí `updatedAt` z klienta. Pokud má jedno zařízení posunutý čas, vyhraje špatná verze. Stačí to pro jednoho uživatele na dvou zařízeních. Případně se to zpřesní pomocí `serverUpdatedAt`.
- Souběžná úprava téže poznámky na dvou zařízeních offline: jedna verze přepíše druhou. Přepsaná verze zůstane v historii verzí na zařízení, kde vznikla.
- Přihlášení jiným účtem na stejném zařízení nahraje do něj místní data (přijato, synchronizace jen pro jeden účet).
- Limity tarifu Spark (50 tis. čtení a 20 tis. zápisů denně): psaní poznámky ukládá průběžně, proto se odesílání z fronty slučuje (debounce), aby každý stisk klávesy nebyl jeden zápis.

### Porty a projekty
- Projekty: `demo-tapnote` (výchozí, emulátory), alias `prod` = `tapnote-petr`.
- Porty emulátorů (`firebase.json`): Auth 9102, Firestore 8092, UI 4009, hub 4409, logging 4509, websocket Firestore 9152. Obsazené jinými projekty: gym-tracker 9099/8088/UI 4000, polyglot 9100/8090/5010, neon-keys 9098/8087, gradus 8089, python-quest 9101/8091.
- Konfigurace: `src/app/core/firebase/firebase.config.ts` (název podle polyglotu); prod hodnoty z `apps:sdkconfig WEB` doplněny 27. 10. 2026.
- Rules testy: `npm run test:rules` (`rules-tests/`, `vitest.rules.config.mts`). Emulátor potřebuje JDK ≥ 21 (JBR v Android Studiu je 25), jen v shellu příkazu (Git Bash: `export JAVA_HOME="C:/Program Files/Android/Android Studio/jbr"; export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"` – v PATH tvar `/c/…`, `C:/…` dvojtečka rozbije).
- Allowlist uid ve `firestore.rules`: testovací `emulator-owner` a uid vlastníka (28. 10. 2026). Kdo nemá uid v seznamu, aplikaci používá jen lokálně; po přihlášení vidí „Tento účet nemá k synchronizaci přístup.“
- **Povolení dalšího účtu:** dotyčný se jednou přihlásí na webu → uid se přečte `npx firebase auth:export <soubor> --format=json --project prod` (soubor po přečtení smazat) nebo v konzoli Authentication › Users → uid se přidá do seznamu v `allowed()` → `npm run test:rules` → `npx firebase deploy --only firestore:rules --project prod` (spouští uživatel). Data každého účtu jsou oddělená pod `users/<uid>/`.

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
8. ✅ **Editor – spodní panel nástrojů:** Checklist, Tag, Barva, ⋯ (Historie se přesune sem z horní lišty)
9. ✅ **Nastavení jako rozcestník + Vzhled** (podle bodu 6), přesměrování odkazů `?` → zkratky a Zálohovat
10. ✅ **Kategorie:** vlastní obrazovka, počty položek, úprava ve spodním panelu na `<dialog>` + `showModal()`, „+ Nová“ dole na dosah palce
11. ✅ **Detail úkolu a Historie** dorovnat do stejného jazyka
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

### Desktop – společný směr (schváleno 23. 10. 2026 podle návrhu v závorce)
Podklady: `.tmp/mockup/desktop/A/` (UX), `.tmp/mockup/desktop/B/` (grafika), vzájemná hodnocení `A/hodnoceni-B.md` a `B/hodnoceni-A.md`. Oba návrhy dostaly 62 / 80; oba hodnotitelé se shodli na kombinaci: struktura a klávesnice z A, vizuál z B.

Rozhodnutí (v závorce návrh):
1. Zlomy 900 px (kolejnice 84 px) a 1200 px (panel 256 px + seznam vedle detailu)? (ano)
2. Seznam vedle detailu přes rodičovskou routu `tn-split` s prázdnou cestou (A), URL beze změny, bez child rout `/notes/:id` z B? (ano; levnější varianta je jen panel a šířky bez detailu vedle seznamu)
3. FAB od 900 px skrýt, „Nová poznámka“ a „Dnešní poznámka“ do panelu? (ano)
4. Panel nástrojů editoru zůstává ukotvený dole v panelu editoru, ne nahoře (B by rozešel pořadí Tab a vizuální pořadí)? (dole)
5. Sklo jen na panelu a horní liště, záře škálovaná podle plochy (B)? (ano)
6. Kompaktní cíle 36–40 px jen pro `pointer: fine`, dotykový tablet dál 44 px? (ano)
7. Nadpis „Poznámky“ místo loga, značka Tapnote v panelu? (ano)
8. Nastavení na desktopu jen CSS (S2), rozcestník vlevo (S1) později? (S2)
9. Štítky `kbd` u existujících zkratek a „Přehled zkratek“ v panelu (A), „Přeskočit na obsah“, typografie editoru 17 / 1,65, mřížka max. 1240 px (B)? (ano)
10. Globální zkratky `N`/`D` a počty u odkazů v panelu? (zatím ne, předložit znovu po bodech 1–9)

Pracnost: panel, šířky a štítky 1–1,5 dne; seznam vedle detailu (poznámky + úkoly) 3–5 dní podle B, A odhadoval méně. Riziko: při změně šířky přes 1200 px se seznam odpojí a ztratí posunutí i fokus, nutný e2e test 1440 × 900.

### Drag & drop – návrh (schváleno 23. 10. 2026 podle návrhu v závorce)
Podklady: `.tmp/dnd/analyza.md`, `.tmp/dnd/proto.html`. Pořadí: kategorie (pilot), checklist, úkoly; odhad 3,5–5,5 dne.

Rozhodnutí (v závorce návrh):
- R1 Vlastní Pointer Events s jednou sdílenou direktivou `tnReorder`, nebo Angular CDK (+12–15 kB v úvodním balíku)? (vlastní)
- R2 Přetahuje se jen za úchyt ⠿, bez dlouhého stisku řádku? (ano)
- R3 Checklist: řadí se jen položky nejvyšší úrovně i s podpoložkami, hotové zůstávají dole a sbalené; řazení podpoložek později? (ano)
- R4 Alternativa pro WCAG 2.5.7 u checklistu a úkolů: menu úchytu (nahoru / dolů / na začátek / na konec), nebo ▲▼ v řádku? (menu úchytu)
- R5 Úkoly dostanou pole `order` (mění formát zálohy), ruční pořadí jen v Můj den, Důležité a Vše, Naplánované dál podle termínu? (ano; změna 27. 10. 2026 kvůli synchronizaci: při přesunu dostanou nový `updatedAt` všechny přečíslované úkoly, ne jen přesunutý, aby se pořadí synchronizovalo)
- R6 Nový úkol nahoru, nebo dolů? (nahoru)
- R7 Přetažení na kategorii až s desktopem, mezi pohledy vůbec? (ano)
- R8 Pořadí kroků úkolu taky? (později)

### Kroky desktop a drag & drop (každý s plným lifecyclem a vlastním commitem)
15. ✅ **Desktop 1 – panel a kolejnice:** `bottom-nav` od 900 px jako kolejnice 84 px, od 1200 px panel 256 px se sklem; odkazy „Nová poznámka“ a „Dnešní poznámka“ v panelu, „Přeskočit na obsah“, FAB od 900 px skrytý, nadpis „Poznámky“ místo loga
16. ✅ **Desktop 2 – šířky a myš:** mřížka max. 1240 px (`auto-fill`), max. šířky stránek, hover jen pod `hover: hover`, kompaktní cíle 36–40 px pod `pointer: fine`, typografie editoru 17 / 1,65, záře podle plochy
17. ✅ **Desktop 3 – štítky zkratek:** `kbd` u existujících zkratek (jen `pointer: fine` a zapnuté zkratky), „Přehled zkratek“ v panelu
18. ✅ **Desktop 4 – poznámky vedle editoru:** rodičovská routa `tn-split` s prázdnou cestou, `NotesList` s `pane`, URL beze změny, návrat fokusu
19. ✅ **Desktop 5 – úkoly vedle detailu a panel nástrojů:** `tn-split` pro `task/:id`, panel nástrojů editoru ukotvený dole ve sloupci editoru s popisky
20. ✅ **Desktop 6 – Nastavení S2 a e2e 1440 × 900:** podstránky na střed, projekt e2e 1440 × 900 světlý/tmavý, axe, průchod klávesnicí, změna šířky přes 1200 px
21. ✅ **D&D 1 – direktiva `tnReorder` + kategorie (pilot):** úchyt ⠿, Pointer Events, autoscroll, klávesové uchopení, live region; ▲▼ u kategorií zůstávají
22. ✅ **D&D 2 – checklist:** `moveGroup` v `checklist.ts`, jen otevřené položky nejvyšší úrovně s podpoložkami, menu úchytu (nahoru / dolů / na začátek / na konec)
23. ✅ **D&D 3 – úkoly:** pole `order` (migrace Dexie, záloha a import), ruční pořadí v Můj den, Důležité a Vše, nový úkol nahoru, menu úchytu

24. ✅ **Zkratky na samostatné stránce:** sekce „Klávesové zkratky“ (přepínač „Zapnout klávesové zkratky“ a tabulka) se z rozcestníku Nastavení přesune na `/settings/zkratky` podle vzoru Vzhledu a Kategorií; řádek rozcestníku, zkratka `?`, odkaz „Přehled zkratek“ v panelu a starý odkaz `/settings#shortcuts` vedou na novou stránku s fokusem na nadpisu

### Hlídat v každém kroku
- Kontrast: bílá na oranžovém konci přechodu má 2,5–3,0 : 1 (nepoužívat pro text), světlý přechodový nadpis končit `#c2410c`, okraje polí přes `--outline`; axe za `backdrop-filter` kontrast nespočítá → ruční vzorkování pixelů a druhý průchod bez průhlednosti
- Cíle dotyku ≥ 44 px, minima písma (navigace 12 px, metadata 13 px) zůstávají i proti menším velikostem v D
- Pevná lišta nesmí zakrýt fokus (WCAG 2.4.11), nativní checkboxy a radia, odkazy s `aria-current`
- Rozpočet stylů komponent 8 kB → sklo a přechody držet v `styles.scss`
- Písma v `/media/*.woff2` (prefetch service workeru) i v APK

## Otevřené
