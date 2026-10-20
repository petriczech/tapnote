// Vzhled aplikace; při startu ho před vykreslením nastavuje i skript v index.html (stejný klíč a hodnoty)
export const THEME_KEY = 'tapnote.theme';

export const THEMES = [
  { id: 'konfety', label: 'Konfety' },
  { id: 'blue', label: 'Modrá' },
  { id: 'paper', label: 'Papír' },
  { id: 'graphite', label: 'Grafit' },
  { id: 'white', label: 'Bílá' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return isThemeId(value) ? value : 'konfety';
  } catch {
    return 'konfety';
  }
}

// Konfety jsou výchozí vzhled bez atributu
export function applyTheme(theme: ThemeId): void {
  if (theme === 'konfety') {
    delete document.documentElement.dataset['theme'];
  } else {
    document.documentElement.dataset['theme'] = theme;
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Bez úložiště platí vzhled jen do zavření
  }
}
