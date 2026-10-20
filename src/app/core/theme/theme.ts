// Vzhled aplikace; při startu ho před vykreslením nastavuje i skript v index.html (stejný klíč a hodnoty)
export const THEME_KEY = 'tapnote.theme';

// Náhled: pozadí, karta, akcent (světlá varianta)
export const THEMES = [
  { id: 'konfety', label: 'Konfety', preview: ['#fff8f1', '#ffffff', '#5b2ee8'] },
  { id: 'blue', label: 'Modrá', preview: ['#fbf9ff', '#ffffff', '#1a56b8'] },
  { id: 'paper', label: 'Papír', preview: ['#f7f1e3', '#fffaf0', '#b4441c'] },
  { id: 'graphite', label: 'Grafit', preview: ['#f0f0f0', '#ffffff', '#0d7a5f'] },
  { id: 'white', label: 'Bílá', preview: ['#ffffff', '#f4f4f5', '#5b2ee8'] },
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
