// Klávesové zkratky pro desktop; dají se vypnout v Nastavení (WCAG 2.1.4)
export const SHORTCUTS_KEY = 'tapnote.shortcuts';

export const SHORTCUTS = [
  { place: 'Seznam', keys: 'N', label: 'Nová poznámka' },
  { place: 'Seznam', keys: '/ nebo Ctrl + F', label: 'Hledat' },
  { place: 'Seznam', keys: '↓ / ↑', label: 'Další / předchozí poznámka, Enter ji otevře' },
  { place: 'Seznam', keys: 'P', label: 'Připnout nebo odepnout vybranou poznámku' },
  { place: 'Seznam', keys: 'A', label: 'Archivovat nebo vrátit z archivu' },
  { place: 'Seznam', keys: 'Delete', label: 'Smazat (do koše)' },
  { place: 'Seznam', keys: '?', label: 'Přehled zkratek' },
  { place: 'Editor', keys: 'Esc', label: 'Zpět na seznam' },
  { place: 'Editor', keys: 'Ctrl + Enter', label: 'Hotovo / Upravit' },
  { place: 'Editor', keys: 'Ctrl + Shift + L', label: 'Checklist na řádku' },
] as const;

export function readShortcutsEnabled(): boolean {
  try {
    return localStorage.getItem(SHORTCUTS_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function writeShortcutsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(SHORTCUTS_KEY, enabled ? 'on' : 'off');
  } catch {
    // Bez úložiště platí volba jen do zavření
  }
}

// Jednoklávesové zkratky jen mimo psaní a bez Ctrl/Alt/Meta (AltGr na některých klávesnicích píše běžné znaky)
export function isPlainKey(event: KeyboardEvent): boolean {
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input:not([type=checkbox], [type=radio]), textarea, select'));
  const modified = event.metaKey || ((event.ctrlKey || event.altKey) && !event.getModifierState('AltGraph'));
  return !typing && !modified && !event.isComposing && !event.defaultPrevented;
}
