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
- [ ] **One-tap zápis:** výchozí route `/` = editor nové poznámky; seznam až za zpět/menu
  - poznámka vznikne až při prvním znaku (lazy create), prázdné se neukládají
  - návrat do 5 min → pokračovat v rozepsané poznámce (konfigurovatelné)
  - klávesnice hned otevřená (Capacitor: `windowSoftInputMode="stateAlwaysVisible"` + autofocus / `Keyboard.show()`)
- [ ] **Zkratka „Nová poznámka“:** PWA manifest `shortcuts` → `/new`; Android `shortcuts.xml` (dlouhý stisk ikony, přetažení na plochu)
- [ ] **Markdown editor:** lehký (`textarea` nebo CodeMirror 6), živý náhled; uloženo jako čistý Markdown
- [ ] **Checklisty:** `- [ ]` toggle tapnutím, hotové položky dolů + sbalit
- [ ] **Organizace:** tagy, připnutí, archiv, koš (automatické smazání po 30 dnech)
- [ ] **Hledání:** MiniSearch v paměti (fuzzy, prefix, tagy)
- [ ] **Export/import JSON:** export přes share sheet / download; import přes file picker; validace + migrace podle `schemaVersion`; merge podle `id` + `updatedAt` nebo „nahradit vše“
- [ ] **Připomínka zálohy:** „bez zálohy X dní“

### Fáze 2
- [ ] **Šablony:** poznámka s `isTemplate: true`; výběr u „+“; proměnné `{{date}}`, `{{time}}`, `{{weekday}}`, `{{cursor}}`; výchozí tagy a barva
- [ ] Barvy poznámek + přepínač grid/list
- [ ] Historie verzí (snapshot po pauze v psaní, posledních ~20)
- [ ] **Quick Settings tile** (nativní `TileService`) → otevře editor

### Fáze 3 (nativní doplňky)
- [ ] **Widget** (Glance): připnutá poznámka / checklist s odškrtáváním + tlačítko „+“
- [ ] `[[odkazy]]` + backlinky (seznam „odkazuje sem“, bez grafu)
- [ ] Denní poznámka (jedno tapnutí na dnešní datum)

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

interface NotesExport {
  schemaVersion: 1;
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
10. Fáze 3: widget + WidgetBridge, backlinky, denní poznámka

## Otevřené
- Název aplikace, logo, design (navazující průzkum: UI top aplikací, Material 3, koncepty loga, požadavky na ikony)
